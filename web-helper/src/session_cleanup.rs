//! Preserve preparation failures without allowing recovery after failed cleanup.
pub fn finish(
    primary: Result<(), String>,
    cleanup: &[(&str, Result<(), String>)],
) -> Result<(), String> {
    let failed = cleanup.iter().find(|(_, result)| result.is_err());
    match (primary, failed) {
        (Err(error), Some((code, _))) if error == "MATCH_RECOVERY_REQUIRED" => Err((*code).into()),
        (Err(error), _) => Err(error),
        (Ok(()), Some((code, _))) => Err((*code).into()),
        (Ok(()), None) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preparation_failure_survives_cleanup_failure() {
        assert_eq!(finish(Err("NATIVE_INSTALL_FAILED".into()), &[
            ("INSPECTOR_STOP_FAILED", Err("private path".into()))
        ]), Err("NATIVE_INSTALL_FAILED".into()));
    }
    #[test]
    fn cleanup_failure_blocks_success_and_automatic_recovery() {
        for result in [Ok(()), Err("MATCH_RECOVERY_REQUIRED".into())] {
            assert_eq!(finish(result, &[("NATIVE_CLEANUP_FAILED", Err("private".into()))]),
                Err("NATIVE_CLEANUP_FAILED".into()));
        }
        assert_eq!(finish(Err("MATCH_RECOVERY_REQUIRED".into()), &[]), Err("MATCH_RECOVERY_REQUIRED".into()));
        assert_eq!(finish(Ok(()), &[]), Ok(()));
    }
}
