-- CreateTable
CREATE TABLE "anonymous_election_keys" (
    "election_id" TEXT NOT NULL,
    "public_key_pem" TEXT NOT NULL,
    "private_key_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_election_keys_pkey" PRIMARY KEY ("election_id")
);

-- CreateTable
CREATE TABLE "anonymous_credentials" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "elector_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_commitments" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "y" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_votes" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "ballot_id" VARCHAR(36) NOT NULL,
    "candidacy_id" TEXT,
    "payload" JSON NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_credentials_election_id_elector_id_key" ON "anonymous_credentials"("election_id", "elector_id");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_commitments_election_id_y_key" ON "anonymous_commitments"("election_id", "y");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_votes_ballot_id_key" ON "anonymous_votes"("ballot_id");

-- CreateIndex
CREATE INDEX "anonymous_votes_election_id_candidacy_id_idx" ON "anonymous_votes"("election_id", "candidacy_id");

-- AddForeignKey
ALTER TABLE "anonymous_election_keys" ADD CONSTRAINT "anonymous_election_keys_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_credentials" ADD CONSTRAINT "anonymous_credentials_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_credentials" ADD CONSTRAINT "anonymous_credentials_elector_id_fkey" FOREIGN KEY ("elector_id") REFERENCES "electors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_commitments" ADD CONSTRAINT "anonymous_commitments_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_votes" ADD CONSTRAINT "anonymous_votes_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

