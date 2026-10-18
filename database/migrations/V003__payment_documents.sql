-- =====================================================================
-- V003 - Documentos de pagos de suscripción: factura emitida + comprobante/evidencia de pago
-- Los archivos son de plataforma (file_asset.tenant_id NULL, kind INVOICE / PAYMENT_PROOF):
-- sólo el super admin los ve y no consumen el almacenamiento del plan de la clínica.
-- =====================================================================
ALTER TABLE tenant_payment
  ADD COLUMN invoice_number   VARCHAR(40) NULL AFTER reference,
  ADD COLUMN invoice_file_id  CHAR(36)    NULL AFTER invoice_number,
  ADD COLUMN receipt_file_id  CHAR(36)    NULL AFTER invoice_file_id,
  ADD CONSTRAINT fk_tpay_invoice_file FOREIGN KEY (invoice_file_id) REFERENCES file_asset(id),
  ADD CONSTRAINT fk_tpay_receipt_file FOREIGN KEY (receipt_file_id) REFERENCES file_asset(id);
