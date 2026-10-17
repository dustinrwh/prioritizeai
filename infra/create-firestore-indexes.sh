#!/bin/sh
# Creates the composite indexes the API's queries need. Safe to re-run (existing indexes are skipped). Usage: infra/create-firestore-indexes.sh PROJECT_ID
set -e
P="${1:?usage: create-firestore-indexes.sh PROJECT_ID}"
mk() { gcloud firestore indexes composite create --project "$P" --collection-group="$1" "${@:2}" 2>&1 | grep -v -i "already exists" || true; }
# Wins: done projects in a completion-date window, newest first
mk submissions --query-scope=collection --field-config=field-path=status,order=ascending --field-config=field-path=completed_at,order=descending
# Latest AI suggestion / impact estimate for a submission, and "latest for these submissions"
mk ai_suggestions --query-scope=collection --field-config=field-path=submission_id,order=ascending --field-config=field-path=created_at,order=descending
mk impact_suggestions --query-scope=collection --field-config=field-path=submission_id,order=ascending --field-config=field-path=created_at,order=descending
# Hourly rate limits per user
mk ai_suggestions --query-scope=collection --field-config=field-path=requested_by,order=ascending --field-config=field-path=created_at,order=ascending
mk impact_suggestions --query-scope=collection --field-config=field-path=requested_by,order=ascending --field-config=field-path=trigger,order=ascending --field-config=field-path=created_at,order=ascending
