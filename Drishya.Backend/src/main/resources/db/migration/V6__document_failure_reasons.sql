-- Structured validation failures on the document row.
--
-- The ASN validator has always produced these as structured objects — a code, a
-- field, what was expected and what arrived — and the API returns them that way.
-- They were being flattened into the free-text `note` column on the way into the
-- database, which threw away every part a machine could use: you could read why
-- a notice failed, but not filter on it, count it, or drive a UI from it.
--
-- `note` stays, because a one-line human summary is genuinely useful in a list
-- view where rendering the full structure would be noise.
ALTER TABLE shipment_documents ADD COLUMN failure_reasons jsonb;

COMMENT ON COLUMN shipment_documents.failure_reasons IS
    'Structured validation failures as returned by the ASN validator chain. '
    'The note column holds a human summary of the same thing.';
