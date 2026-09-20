HWANIAC v2 - NIFS real-time water-temperature collector

Add/overwrite these paths in the existing repository:
  .github/workflows/update-nifs.yml
  scripts/fetch_nifs.py
  data/risa-latest.json
  data/risa-stations.json

Required repository secret:
  NIFS_API_KEY

After upload, open GitHub > Actions > Update NIFS water temperature > Run workflow.
If successful, risa-latest.json and risa-stations.json will be updated and then refreshed every ~30 minutes by GitHub Actions.

Note: GitHub scheduled workflows can be delayed under load; the cron is intentionally offset from :00/:30.
