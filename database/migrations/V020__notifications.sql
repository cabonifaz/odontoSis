-- =====================================================================
-- V020 - Notificaciones para los usuarios (campana y contadores del menú)
--   Una fila por destinatario. area agrupa para el contador del menú (p. ej. 'requests').
--   Hoy se generan desde las solicitudes de soporte y mejoras:
--     * respuesta / cambio de estado de la plataforma  → al usuario de la clínica que la creó
--     * solicitud nueva de una clínica                  → a cada super admin
-- =====================================================================

CREATE TABLE notification (
  id          CHAR(36)     NOT NULL,
  tenant_id   CHAR(36)     NULL,             -- NULL = notificación de plataforma (super admin)
  user_id     CHAR(36)     NOT NULL,         -- destinatario
  area        VARCHAR(30)  NOT NULL,         -- requests | …
  kind        VARCHAR(40)  NOT NULL,         -- REQUEST_UPDATED | REQUEST_CREATED | …
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(500) NULL,
  link        VARCHAR(300) NULL,             -- ruta interna de la app
  entity_id   CHAR(36)     NULL,             -- registro relacionado (p. ej. la solicitud)
  read_at     DATETIME(3)  NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_notification_user (user_id, read_at, created_at),
  KEY ix_notification_entity (entity_id),
  CONSTRAINT fk_notification_user   FOREIGN KEY (user_id)   REFERENCES app_user(id),
  CONSTRAINT fk_notification_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
