use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessOutputEvent {
    pub(crate) run_id: String,
    pub(crate) stream: String,
    pub(crate) line: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessExitEvent {
    pub(crate) run_id: String,
    pub(crate) exit_code: Option<i32>,
    pub(crate) success: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct ProcessStarted {
    pub(crate) pid: u32,
}
