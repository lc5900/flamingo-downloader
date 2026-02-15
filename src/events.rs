use std::sync::Arc;

use anyhow::Result;

use crate::models::Task;

pub trait EventEmitter: Send + Sync {
    fn emit_task_update(&self, tasks: &[Task]) -> Result<()>;
}

#[derive(Default)]
pub struct StdoutEventEmitter;

impl EventEmitter for StdoutEventEmitter {
    fn emit_task_update(&self, tasks: &[Task]) -> Result<()> {
        if tasks.is_empty() {
            return Ok(());
        }
        let payload = serde_json::to_string(tasks)?;
        println!("task_update {payload}");
        Ok(())
    }
}

pub type SharedEmitter = Arc<dyn EventEmitter>;
