import { connectDatabase } from "../src/data/connection";
import { applyStudyPlan, validateTarget } from "./study-plan-operator";

async function main() {
  const target = validateTarget(process.env);
  console.log("TEST_TARGET_OK: true");
  const c = connectDatabase(target);
  try {
    console.log(JSON.stringify(await applyStudyPlan(c, "data/backups/study-plan-operator")));
  } finally { c.close(); }
}
main().catch(() => {
  // Never print driver errors, connection strings, SQL payloads or credentials.
  console.error("STOPPED: validation or transaction failed. No automatic retry. If commit acknowledgement was lost, verify state by rerunning this idempotent operator.");
  process.exitCode = 1;
});
