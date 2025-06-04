-- Update coupon list query to use full_name instead of name and handle status conversion
CREATE OR REPLACE FUNCTION get_coupon_list() RETURNS TABLE (
    id INTEGER,
    code VARCHAR,
    description TEXT,
    max_uses INTEGER,
    current_uses INTEGER,
    status BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_by INTEGER,
    actual_uses BIGINT,
    usage_details JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.*,
           COUNT(DISTINCT cu.id) as actual_uses,
           json_agg(
               json_build_object(
                   'user_id', u.id,
                   'name', COALESCE(u.display_name, u.full_name),
                   'email', u.email,
                   'used_at', cu.used_at
               )
           ) FILTER (WHERE u.id IS NOT NULL) as usage_details
    FROM coupons c
    LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
    LEFT JOIN users u ON cu.user_id = u.id
    GROUP BY c.id;
END;
$$ LANGUAGE plpgsql; 