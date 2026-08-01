CREATE TABLE IF NOT EXISTS guest_pass_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_client_id text NOT NULL,
  benefit_month date NOT NULL,
  reservation_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'booked')),
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_client_id text,
  class_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  booked_at timestamptz,
  UNIQUE (member_client_id, benefit_month)
);

ALTER TABLE guest_pass_redemptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION monthly_guest_pass_available(p_member_client_id text, p_benefit_month date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM guest_pass_redemptions
    WHERE member_client_id = p_member_client_id
      AND benefit_month = p_benefit_month
      AND (status = 'booked' OR created_at > now() - interval '15 minutes')
  );
$$;

CREATE OR REPLACE FUNCTION reserve_monthly_guest_pass(p_member_client_id text, p_benefit_month date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE token uuid;
BEGIN
  DELETE FROM guest_pass_redemptions
  WHERE member_client_id = p_member_client_id
    AND benefit_month = p_benefit_month
    AND status = 'reserved'
    AND created_at <= now() - interval '15 minutes';

  INSERT INTO guest_pass_redemptions (member_client_id, benefit_month)
  VALUES (p_member_client_id, p_benefit_month)
  ON CONFLICT (member_client_id, benefit_month) DO NOTHING
  RETURNING reservation_token INTO token;

  RETURN token;
END;
$$;

CREATE OR REPLACE FUNCTION complete_monthly_guest_pass(
  p_reservation_token uuid,
  p_guest_first_name text,
  p_guest_last_name text,
  p_guest_email text,
  p_guest_client_id text,
  p_class_id bigint
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE guest_pass_redemptions
  SET status = 'booked', guest_first_name = p_guest_first_name,
      guest_last_name = p_guest_last_name, guest_email = p_guest_email,
      guest_client_id = p_guest_client_id, class_id = p_class_id, booked_at = now()
  WHERE reservation_token = p_reservation_token;
$$;

CREATE OR REPLACE FUNCTION release_monthly_guest_pass(p_reservation_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM guest_pass_redemptions
  WHERE reservation_token = p_reservation_token AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION monthly_guest_pass_available(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_monthly_guest_pass(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_monthly_guest_pass(uuid, text, text, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_monthly_guest_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monthly_guest_pass_available(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_monthly_guest_pass(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION complete_monthly_guest_pass(uuid, text, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION release_monthly_guest_pass(uuid) TO service_role;
