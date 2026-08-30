-- The ASN validator writes a summary of every blocking failure into this
-- column, and a notice can fail several checks at once. The default 255 was
-- sized for a one-line remark and overflowed the first time a consignment
-- failed four checks together, which surfaced as a 500 on submission rather
-- than as the structured rejection the endpoint exists to return.
ALTER TABLE shipment_documents ALTER COLUMN note TYPE varchar(2000);
