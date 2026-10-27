// Select the background companion before importing the desktop shell. The helper
// never creates the launcher's window, tray, updater, or saved account session.
if (process.argv.includes('--native-helper-runtime')) {
  void import('./native-helper-runtime')
} else {
  void import('./index')
}
