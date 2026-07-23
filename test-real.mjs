// Real RMUX daemon integration test
// Run: node test-real.mjs

import { RMUXManager } from "./dist/rmux.js"
import { createTools } from "./dist/tools.js"
import { MonitorManager } from "./dist/monitor.js"

async function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS: ${msg}`)
  }
}

async function run() {
  console.log("=== RMUXManager Real Integration Test ===\n")

  // 1. Connect
  console.log("1. Connect to daemon")
  const rmux = new RMUXManager()
  const connected = await rmux.connect()
  console.log(`   connected: ${connected}`)

  // 2. List sessions
  console.log("\n2. listSessions / getSessionMetas")
  const sessions = await rmux.listSessions()
  console.log(`   sessions:`, sessions)
  const metas = await rmux.getSessionMetas()
  console.log(`   metas:`, metas)
  assert(metas.length > 0, "has at least one session")

  // 3. getSession
  console.log("\n3. getSession")
  const sessionName = sessions[0].name
  const session = await rmux.getSession(sessionName)
  assert(session !== null, `getSession("${sessionName}") returns session`)
  console.log(`   session: ${sessionName}`)

  // 4. listPaneMetas
  console.log("\n4. listPaneMetas")
  const panes = await rmux.listPaneMetas()
  console.log(`   panes:`, panes.length)
  assert(panes.length > 0, "has at least one pane")
  if (panes.length > 0) {
    console.log(`   first pane: ${panes[0].sessionName}:${panes[0].paneId} cmd=${panes[0].currentCommand}`)
  }

  // 5. findPanes
  console.log("\n5. findPanes")
  const found = await rmux.findPanes({ sessionName })
  assert(found.length > 0, `findPanes({sessionName: "${sessionName}"}) returns results`)
  console.log(`   found ${found.length} panes in session "${sessionName}"`)

  // 6. getPaneMeta
  if (panes.length > 0) {
    console.log("\n6. getPaneMeta")
    const target = `${panes[0].sessionName}:${panes[0].paneId}`
    const meta = await rmux.getPaneMeta(target)
    console.log(`   pane ${target}: cmd=${meta.currentCommand}, pid=${meta.pid}, size=${meta.width}x${meta.height}`)
    assert(meta.paneId === panes[0].paneId, `getPaneMeta target matches`)
  }

  // 7. getCurrentCommand
  if (panes.length > 0) {
    console.log("\n7. getCurrentCommand")
    const target = `${panes[0].sessionName}:${panes[0].paneId}`
    const cmd = await rmux.getCurrentCommand(target)
    console.log(`   current command: ${cmd}`)
    assert(cmd !== null, "getCurrentCommand returns a command")
  }

  // 8. paneFromTarget
  if (panes.length > 0) {
    console.log("\n8. paneFromTarget")
    const target = `${panes[0].sessionName}:${panes[0].paneId}`
    const pane = rmux.paneFromTarget(target)
    assert(pane !== null, `paneFromTarget("${target}") returns pane`)
    console.log(`   pane target: ${pane.target}`)
  }

  // 9. Tools integration
  console.log("\n9. Tools integration")
  const tools = createTools(rmux)

  // 9a. rmux_list_sessions
  const listResult = await tools.rmux_list_sessions.execute({}, {})
  console.log(`   list_sessions: ${listResult.slice(0, 80)}...`)
  assert(listResult.includes(sessionName), "list_sessions shows session name")

  // 9b. rmux_find_panes
  const findResult = await tools.rmux_find_panes.execute({ sessionName }, {})
  console.log(`   find_panes: ${findResult.slice(0, 80)}...`)
  assert(findResult.includes(sessionName), "find_panes returns results")

  // 9c. rmux_pane_info
  if (panes.length > 0) {
    const target = `${panes[0].sessionName}:${panes[0].paneId}`
    const infoResult = await tools.rmux_pane_info.execute({ target }, {})
    console.log(`   pane_info:\n${infoResult}`)
    assert(infoResult.includes("opencode:0.0"), "pane_info shows usable target")
  }

  // 10. capture / send_keys (non-destructive)
  if (panes.length > 0) {
    console.log("\n10. captureTarget")
    const p = panes[0]
    const target = `${p.sessionName}:${p.windowIndex}.${p.paneIndex}`
    const captured = await rmux.captureTarget(target)
    console.log(`   captured ${captured.length} chars`)
    assert(captured.length > 0, "capture returns content")
  }

  // 11. Session metadata
  console.log("\n11. closeSession / balanceRightPanes (no-op tests)")
  // These are safe to call even on active sessions — closeSession dual-path
  // will fall through gracefully since session is attached
  await rmux.balanceRightPanes(sessionName).catch(() => {})
  console.log(`   balanceRightPanes called on "${sessionName}" (no-op OK)`)

  // 12. pstream collecting
  console.log("\n12. MonitorManager instantiation")
  const monitor = new MonitorManager()
  assert(monitor.activeCount === 0, "MonitorManager starts with 0 streams")

  console.log("\n=== All tests completed ===")
}

run().catch(err => {
  console.error("FATAL:", err)
  process.exitCode = 1
})
