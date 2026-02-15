use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("task not found: {0}")]
    TaskNotFound(String),
}
