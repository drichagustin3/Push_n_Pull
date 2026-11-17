"""Opt-in psql race test against a disposable migrated hopedb_dba04_verify database."""
import concurrent.futures
import hashlib
import os
import secrets
import subprocess
import threading


def query(sql):
    result = subprocess.run(
        ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True, check=True, timeout=20,
    )
    return result.stdout.strip()


def main():
    if os.environ.get("DBA04_LOCAL_TEST") != "1" or os.environ.get("PGDATABASE") != "hopedb_dba04_verify":
        raise SystemExit("Requires DBA04_LOCAL_TEST=1 and disposable PGDATABASE=hopedb_dba04_verify.")
    # Locally generated fixtures only. Raw token material never reaches SQL or output.
    token_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
    email = "reset-race-" + secrets.token_hex(12) + "@example.test"
    user_id = query(
        "INSERT INTO app_user(first_name,last_name,email) "
        "VALUES ('Reset','Race fixture','" + email + "') RETURNING user_id;"
    )
    assert user_id.isdigit()
    try:
        token_id = query(
            "INSERT INTO password_reset_token(user_id,token_hash) VALUES ("
            + user_id + ",'" + token_hash + "') RETURNING id;"
        )
        assert token_id.isdigit()
        barrier = threading.Barrier(4)

        def claim(_):
            barrier.wait(timeout=10)
            return query(
                "UPDATE password_reset_token SET is_used=true,used_at=clock_timestamp() "
                "WHERE token_hash='" + token_hash + "' AND NOT is_used "
                "AND expires_at>clock_timestamp() RETURNING id;"
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
            claims = list(workers.map(claim, range(4)))
        assert claims.count(token_id) == 1, "Expected exactly one successful redemption"
        assert claims.count("") == 3, "Expected three failed/replayed redemptions"
        assert query(
            "SELECT is_used AND used_at IS NOT NULL FROM password_reset_token WHERE id=" + token_id
        ) == "t"
        print("PASS: four concurrent claims produced one redemption and three rejections")
    finally:
        query("DELETE FROM password_reset_token WHERE user_id=" + user_id)
        # Respect DBA-03's prohibition on hard-deleting business accounts.
        query("UPDATE app_user SET is_deleted=true WHERE user_id=" + user_id)


if __name__ == "__main__":
    main()
