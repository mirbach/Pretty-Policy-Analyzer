# Security Baselines

Drop Microsoft Security Baseline GPO backup folders here.

## How to get the baselines

1. Visit https://aka.ms/baselines and download the baseline ZIP for your OS version (e.g. Windows 11 23H2).
2. Extract the ZIP.
3. Inside, locate the folder named **`GPOs`** — it contains GPO backup subfolders (GUIDs).
4. Copy those GUID folders into this directory (or point "Load Baseline" at the `GPOs` parent folder).

## Usage

1. Start the app and click **Baseline** in the toolbar.
2. Click **Load Baseline** and select the folder containing the baseline GPO backups.
3. The app will compare every setting in the baseline against all your uploaded GPOs and show you what is missing or configured differently.
