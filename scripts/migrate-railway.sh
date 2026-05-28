#!/bin/bash
set -e

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^(RAILWAY_DATABASE_URL|NODE_ENV)=' | xargs)
fi

if [ -z "$RAILWAY_DATABASE_URL" ]; then
    echo "Error: RAILWAY_DATABASE_URL is not set. Add it to .env (see .env.example)."
    exit 1
fi

export NODE_ENV=production
export DATABASE_URL="$RAILWAY_DATABASE_URL"

node db/migrate.js
