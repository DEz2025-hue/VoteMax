-- Deleting a whole election has to remove its sealed ballots and receipt keys, which the
-- append-only triggers (migration 0002) reject. Keep the protection for everything else:
--   * UPDATE is still always rejected;
--   * the audit log is still always append-only;
--   * ballots and idempotency keys may be DELETED only inside a transaction that has switched
--     on the flag votemax.allow_election_delete (set by the platform's delete-election action
--     with set_config(..., is_local => true), so it expires when that transaction ends).
CREATE OR REPLACE FUNCTION public.votemax_reject_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND TG_TABLE_SCHEMA = 'ballot'
     AND TG_TABLE_NAME IN ('ballots', 'idempotency_keys')
     AND coalesce(current_setting('votemax.allow_election_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'append-only table: % does not allow %', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
