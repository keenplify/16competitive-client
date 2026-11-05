//! Retry only explicit unexpected game failure, after complete restoration.
pub const REQUIRED: &str = "MATCH_RECOVERY_REQUIRED";
pub fn retry(result: &Result<(), String>, stopped: bool) -> bool {
    !stopped && result.as_ref().is_err_and(|error| error == REQUIRED)
}
/// Each attempt must finish verified cleanup before returning. Refreshing the
/// connection is deliberately between attempts, never a reuse of launch secrets.
pub fn run<T>(
    initial: &T,
    mut attempt: impl FnMut(&T) -> Result<(), String>,
    mut refresh: impl FnMut() -> Result<T, String>,
    stopped: impl Fn() -> bool,
) -> Result<(), String> {
    let result = attempt(initial);
    if !retry(&result, stopped()) {
        return result;
    }
    let fresh = refresh()?;
    if stopped() {
        return Ok(());
    }
    attempt(&fresh)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_refreshes_once_after_cleanup_and_is_bounded() {
        let events = std::cell::RefCell::new(Vec::new());
        let result = run(
            &1,
            |connection| {
                events.borrow_mut().push(*connection);
                Err(REQUIRED.into())
            },
            || {
                events.borrow_mut().push(99);
                Ok(2)
            },
            || false,
        );
        assert_eq!(result, Err(REQUIRED.into()));
        assert_eq!(*events.borrow(), vec![1, 99, 2]);
    }
    #[test]
    fn revoked_authorization_never_relaunches() {
        let mut attempts = 0;
        let result = run(
            &1,
            |_| {
                attempts += 1;
                Err(REQUIRED.into())
            },
            || Err("authorization revoked".into()),
            || false,
        );
        assert_eq!(attempts, 1);
        assert_eq!(result, Err("authorization revoked".into()));
    }
    #[test]
    fn stop_during_refresh_never_relaunches() {
        let stop = std::cell::Cell::new(false);
        let mut attempts = 0;
        assert_eq!(
            run(
                &1,
                |_| {
                    attempts += 1;
                    Err(REQUIRED.into())
                },
                || {
                    stop.set(true);
                    Ok(2)
                },
                || stop.get()
            ),
            Ok(())
        );
        assert_eq!(attempts, 1);
    }
    #[test]
    fn only_unexpected_game_failure_can_restart() {
        assert!(retry(&Err(REQUIRED.into()), false));
        assert!(!retry(&Err(REQUIRED.into()), true));
        assert!(!retry(&Ok(()), false));
        for error in [
            "NATIVE_RECOVERY_FAILED",
            "Managed game authorization ended",
            "GAME_SPAWN_FAILED",
            "STICKER_REQUEST_FAILED",
            "DLL restoration failed",
        ] {
            assert!(!retry(&Err(error.into()), false));
        }
    }
}
