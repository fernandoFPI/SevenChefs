CREATE TABLE IF NOT EXISTS salary_records (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             UUID          NOT NULL REFERENCES employees(id),
  period_month            VARCHAR(7)    NOT NULL,

  -- snapshots captured at calculation time
  base_salary             NUMERIC(12,2) NOT NULL,
  std_days_per_month      NUMERIC(6,2)  NOT NULL,
  daily_rate              NUMERIC(12,4) NOT NULL,
  std_hours_per_day       NUMERIC(6,2)  NOT NULL,
  hourly_rate             NUMERIC(12,4) NOT NULL,
  ot_multiplier           NUMERIC(5,2)  NOT NULL,
  late_penalty_unapproved NUMERIC(5,2)  NOT NULL,
  late_penalty_approved   NUMERIC(5,2)  NOT NULL,

  -- attendance aggregates from attendance_daily
  total_present_days      INTEGER       NOT NULL DEFAULT 0,
  total_absent_days       INTEGER       NOT NULL DEFAULT 0,
  total_paid_leave_days   INTEGER       NOT NULL DEFAULT 0,
  total_unpaid_leave_days INTEGER       NOT NULL DEFAULT 0,
  total_off_days          INTEGER       NOT NULL DEFAULT 0,
  approved_ot_hours       NUMERIC(8,2)  NOT NULL DEFAULT 0,
  unapproved_late_hours   NUMERIC(8,2)  NOT NULL DEFAULT 0,
  approved_late_hours     NUMERIC(8,2)  NOT NULL DEFAULT 0,

  -- admin overrides (null = use computed value)
  ot_hours_override       NUMERIC(8,2),
  late_hours_override     NUMERIC(8,2),
  bonus                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions              NUMERIC(12,2) NOT NULL DEFAULT 0,
  note                    TEXT,

  net_salary              NUMERIC(12,2) NOT NULL DEFAULT 0,

  status                  VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  submitted_at            TIMESTAMPTZ,
  approved_at             TIMESTAMPTZ,
  approved_by             UUID REFERENCES users(id),

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (employee_id, period_month)
);

CREATE INDEX ON salary_records (period_month);
CREATE INDEX ON salary_records (employee_id);
CREATE INDEX ON salary_records (status);
