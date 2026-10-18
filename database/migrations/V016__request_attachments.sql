-- =====================================================================
-- V016 - Capturas de pantalla adjuntas a las solicitudes de soporte y mejoras
--   El binario vive en el volumen (file_asset kind REQUEST_ATTACHMENT); aquí sólo el vínculo.
-- =====================================================================

CREATE TABLE tenant_request_attachment (
  id          CHAR(36)  NOT NULL,
  tenant_id   CHAR(36)  NOT NULL,
  request_id  CHAR(36)  NOT NULL,
  file_id     CHAR(36)  NOT NULL,
  sort_order  SMALLINT  NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_attachment_file (file_id),
  KEY ix_request_attachment_request (request_id, sort_order),
  CONSTRAINT fk_request_attachment_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_request_attachment_request FOREIGN KEY (request_id) REFERENCES tenant_request(id),
  CONSTRAINT fk_request_attachment_file    FOREIGN KEY (file_id)    REFERENCES file_asset(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
