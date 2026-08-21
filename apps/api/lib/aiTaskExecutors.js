/**
 * lib/aiTaskExecutors.js
 * Backward-compatibility shim – re-exports everything from the canonical taskExecutors.js.
 * All new code should import from lib/taskExecutors.js directly.
 */
export {
  executeAITask,
  executeTrainerTask,
  executeCoachTask,
  executeMarketingTask,
  executeSocialTask,
} from './taskExecutors';
