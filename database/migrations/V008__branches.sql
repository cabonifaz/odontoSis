-- =====================================================================
-- V008 - Sedes (locales) de la clínica. El plan define cuántas sedes activas puede tener.
-- Plan Inicial (STARTER): 1 sede.
-- =====================================================================
ALTER TABLE plan
  ADD COLUMN max_branches INT NOT NULL DEFAULT 1 AFTER max_users;

CREATE TABLE branch (
  id         CHAR(36)     NOT NULL,
  tenant_id  CHAR(36)     NOT NULL,
  code       VARCHAR(20)  NOT NULL,
  name       VARCHAR(120) NOT NULL,
  address    VARCHAR(300) NULL,
  phone      VARCHAR(40)  NULL,
  is_main    TINYINT(1)   NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_branch_tenant (tenant_id, is_active),
  KEY ix_branch_updated (tenant_id, updated_at),
  CONSTRAINT fk_branch_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE appointment
  ADD COLUMN branch_id CHAR(36) NULL AFTER doctor_id,
  ADD CONSTRAINT fk_appt_branch FOREIGN KEY (branch_id) REFERENCES branch(id);

ALTER TABLE budget
  ADD COLUMN branch_id CHAR(36) NULL AFTER doctor_id,
  ADD CONSTRAINT fk_budget_branch FOREIGN KEY (branch_id) REFERENCES branch(id);

-- Sede principal para cada clínica existente y asignación de lo ya registrado
INSERT INTO branch (id, tenant_id, code, name, address, phone, is_main, is_active)
SELECT UUID(), t.id, 'PRINCIPAL', 'Sede principal', t.address, t.phone, 1, 1
  FROM tenant t
 WHERE t.deleted_at IS NULL;

UPDATE appointment a JOIN branch b ON b.tenant_id = a.tenant_id AND b.is_main = 1 SET a.branch_id = b.id WHERE a.branch_id IS NULL;
UPDATE budget bu JOIN branch b ON b.tenant_id = bu.tenant_id AND b.is_main = 1 SET bu.branch_id = b.id WHERE bu.branch_id IS NULL;
