use std::process::{Command, Stdio};

use crate::platform::launchers::hide_console_window;

#[cfg(target_os = "windows")]
pub(crate) fn send_system_notification(title: &str, body: &str) {
    let escape = |value: &str| {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('\'', "&apos;")
            .replace('"', "&quot;")
    };
    let title = escape(title);
    let body = escape(body);
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; \
         [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; \
         [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; \
         [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null; \
         $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; \
         $xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>{title}</text><text>{body}</text></binding></visual></toast>'); \
         $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); \
         [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Code Deck').Show($toast);"
    );
    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command"])
        .arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console_window(&mut command);
    let _ = command.spawn();
}

#[cfg(target_os = "macos")]
pub(crate) fn send_system_notification(title: &str, body: &str) {
    let escape = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "display notification \"{}\" with title \"{}\"",
        escape(body),
        escape(title)
    );
    let _ = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub(crate) fn send_system_notification(title: &str, body: &str) {
    if which::which("notify-send").is_err() {
        return;
    }
    let _ = Command::new("notify-send")
        .args([title, body])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}
