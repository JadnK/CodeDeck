use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitFileStatus {
    pub(crate) path: String,
    pub(crate) index_status: String,
    pub(crate) work_tree_status: String,
    pub(crate) staged: bool,
    pub(crate) unstaged: bool,
    pub(crate) untracked: bool,
    pub(crate) conflicted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRepositoryStatus {
    pub(crate) branch: Option<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead: usize,
    pub(crate) behind: usize,
    pub(crate) operation: Option<String>,
    pub(crate) files: Vec<GitFileStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitConflictContent {
    pub(crate) path: String,
    pub(crate) base: Option<String>,
    pub(crate) current: String,
    pub(crate) incoming: String,
    pub(crate) working_tree: String,
    pub(crate) binary: bool,
}

pub(crate) fn parse_git_status_files(raw: &str) -> Vec<GitFileStatus> {
    let entries: Vec<&str> = raw.split('\0').filter(|entry| !entry.is_empty()).collect();
    let mut files = Vec::new();
    let mut index = 0usize;
    while index < entries.len() {
        let entry = entries[index];
        let bytes = entry.as_bytes();
        if bytes.len() < 4 {
            index += 1;
            continue;
        }
        let index_status = bytes[0] as char;
        let work_tree_status = bytes[1] as char;
        let path = entry[3..].to_string();
        let pair = format!("{index_status}{work_tree_status}");
        let conflicted = matches!(pair.as_str(), "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU");
        let untracked = pair == "??";
        files.push(GitFileStatus {
            path,
            index_status: index_status.to_string(),
            work_tree_status: work_tree_status.to_string(),
            staged: !untracked && index_status != ' ' && index_status != '?',
            unstaged: !untracked && work_tree_status != ' ' && work_tree_status != '?',
            untracked,
            conflicted,
        });
        index += 1;
        if matches!(index_status, 'R' | 'C') && index < entries.len() {
            index += 1;
        }
    }
    files.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));
    files
}
