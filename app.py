import threading
import time
import json
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# ---------------------------------------------------------
# Global Simulation State & Re-entrant Lock
state_lock = threading.RLock()

# Statistics counters
deadlocks_detected_count = 0
deadlocks_resolved_count = 0
simulation_status = "Idle"  # "Idle", "Running", "Paused", "Deadlocked", "Resolved", "Completed"
current_scenario = "deadlock"

class SimLock:
    """Represents a simulated shared resource (Mutex lock)."""
    def __init__(self, name):
        self.name = name
        self.owner = None          # Name of thread currently holding the lock
        self.wait_queue = []       # List of thread names waiting for this lock
        self.cond = threading.Condition(state_lock)

    def acquire(self, thread_name, stop_event, pause_event):
        """Attempts to acquire lock cooperatively.
        Returns True if acquired, False if cancelled or aborted.
        """
        with self.cond:
            if thread_name not in self.wait_queue and self.owner != thread_name:
                self.wait_queue.append(thread_name)
                add_log(f"[{thread_name}] requested {self.name}. Added to wait queue.", "warning")

            while self.owner is not None and self.owner != thread_name:
                if stop_event.is_set():
                    if thread_name in self.wait_queue:
                        self.wait_queue.remove(thread_name)
                    return False
                
                # Check for pause
                while pause_event.is_set():
                    if stop_event.is_set():
                        if thread_name in self.wait_queue:
                            self.wait_queue.remove(thread_name)
                        return False
                    self.cond.wait(timeout=0.2)

                # Wait with timeout to remain responsive to stop/pause events
                self.cond.wait(timeout=0.2)

            if stop_event.is_set():
                if thread_name in self.wait_queue:
                    self.wait_queue.remove(thread_name)
                return False

            # Lock is available!
            if thread_name in self.wait_queue:
                self.wait_queue.remove(thread_name)
            self.owner = thread_name
            add_log(f"[{thread_name}] successfully acquired {self.name}.", "info")
            return True

    def release(self, thread_name):
        """Releases the lock and notifies waiting threads."""
        with self.cond:
            if self.owner == thread_name:
                self.owner = None
                add_log(f"[{thread_name}] released {self.name}.", "info")
                self.cond.notify_all()
                return True
            return False

    def force_release(self):
        """Forced release when a victim thread is terminated during recovery."""
        with self.cond:
            prev_owner = self.owner
            self.owner = None
            if prev_owner:
                add_log(f"[System] Force-released {self.name} from victim {prev_owner}.", "success")
            self.cond.notify_all()


# Initialize 3 resources
resources = {
    "R1": SimLock("R1"),
    "R2": SimLock("R2"),
    "R3": SimLock("R3"),
}

# Control structures for simulated threads:
# { thread_name: { "thread": Thread, "stop_event": Event, "pause_event": Event, "state": str, "sequence": list, "held": list, "waiting_for": str|None } }
thread_control = {}

# Event log entries: [ {"time": str, "msg": str, "type": "info"|"warning"|"error"|"success"} ]
log = []

def add_log(message, log_type="info"):
    """Thread-safe event logging with timestamp."""
    timestamp = time.strftime("%H:%M:%S", time.localtime())
    with state_lock:
        log.append({"time": timestamp, "msg": message, "type": log_type})

# Synchronization barrier to guarantee deterministic circular wait in deadlock demo
sync_barrier = None

# ---------------------------------------------------------
# Worker Thread Logic
# ---------------------------------------------------------
def thread_worker(name, sequence, stop_event, pause_event, use_barrier=False):
    """Simulates a thread acquiring a sequence of locks."""
    global simulation_status
    with state_lock:
        thread_control[name]["state"] = "Running"
        thread_control[name]["held"] = []
        thread_control[name]["waiting_for"] = None

    add_log(f"[{name}] started execution with sequence: {' -> '.join(sequence)}.", "info")

    for i, res_name in enumerate(sequence):
        if stop_event.is_set():
            break

        # Check pause
        while pause_event.is_set():
            if stop_event.is_set():
                break
            time.sleep(0.1)

        with state_lock:
            thread_control[name]["state"] = "Waiting"
            thread_control[name]["waiting_for"] = res_name

        lock = resources[res_name]
        acquired = lock.acquire(name, stop_event, pause_event)

        if not acquired or stop_event.is_set():
            with state_lock:
                if thread_control[name]["state"] != "Cancelled":
                    thread_control[name]["state"] = "Cancelled"
                thread_control[name]["waiting_for"] = None
            add_log(f"[{name}] stopped before acquiring {res_name}.", "warning")
            break

        # Acquired lock
        with state_lock:
            thread_control[name]["state"] = "Running"
            thread_control[name]["waiting_for"] = None
            if res_name not in thread_control[name]["held"]:
                thread_control[name]["held"].append(res_name)

        # In deadlock demo mode, synchronize all threads after their 1st lock!
        # This guarantees T1 holds R1, T2 holds R2, T3 holds R3 before any attempts 2nd lock!
        if use_barrier and i == 0 and sync_barrier is not None:
            add_log(f"[{name}] holding {res_name}, reaching sync barrier...", "info")
            try:
                sync_barrier.wait(timeout=3.0)
            except threading.BrokenBarrierError:
                pass

        # Simulate critical section work
        work_time = 0.6
        start_work = time.time()
        while time.time() - start_work < work_time:
            if stop_event.is_set():
                break
            time.sleep(0.05)

    # Clean release upon normal completion or cancellation
    with state_lock:
        held_copy = list(thread_control[name]["held"])
    for res_name in reversed(held_copy):
        resources[res_name].release(name)
        with state_lock:
            if res_name in thread_control[name]["held"]:
                thread_control[name]["held"].remove(res_name)

    with state_lock:
        if stop_event.is_set():
            thread_control[name]["state"] = "Cancelled"
            add_log(f"[{name}] terminated (Cancelled).", "warning")
        else:
            thread_control[name]["state"] = "Completed"
            add_log(f"[{name}] successfully finished all tasks (Completed).", "success")
        thread_control[name]["waiting_for"] = None

    # Check if all completed
    check_all_finished()


def check_all_finished():
    """Checks if all running threads have finished."""
    global simulation_status
    with state_lock:
        states = [c["state"] for c in thread_control.values()]
        if states and all(s in ["Completed", "Cancelled"] for s in states):
            if all(s == "Completed" for s in states):
                simulation_status = "Completed"
            elif any(s == "Cancelled" for s in states):
                simulation_status = "Resolved" if deadlocks_resolved_count > 0 else "Idle"


# ---------------------------------------------------------
# Graph Construction & Deadlock Detection (DFS)
# ---------------------------------------------------------
def build_wait_for_graph():
    """Builds the wait-for graph edges.
    An edge Ti -> Tj means thread Ti is waiting for a resource held by thread Tj.
    """
    edges = []
    for lock in resources.values():
        if lock.owner:
            for waiter in lock.wait_queue:
                edges.append({
                    "from": waiter,
                    "to": lock.owner,
                    "resource": lock.name
                })
    return edges

def detect_cycles(edges):
    """Detects cycles in the wait-for graph using Depth First Search (DFS).
    Returns list of cycles, each cycle is a list of thread names.
    Also returns the set of edges that form part of any cycle.
    """
    adj = {}
    for e in edges:
        adj.setdefault(e["from"], []).append(e["to"])

    visited = set()
    recursion_stack = []
    cycles = []

    def dfs(v, path_set):
        visited.add(v)
        path_set.add(v)
        recursion_stack.append(v)

        for neighbor in adj.get(v, []):
            if neighbor not in visited:
                dfs(neighbor, path_set)
            elif neighbor in path_set:
                # Cycle found! Extract the cycle slice
                idx = recursion_stack.index(neighbor)
                cycle = list(recursion_stack[idx:])
                # Avoid duplicate cycles (with rotated ordering)
                normalized = min([cycle[i:] + cycle[:i] for i in range(len(cycle))])
                if normalized not in [min([c[i:] + c[:i] for i in range(len(c))]) for c in cycles]:
                    cycles.append(cycle)

        path_set.remove(v)
        recursion_stack.pop()

    for node in list(adj.keys()):
        if node not in visited:
            dfs(node, set())

    # Identify cycle edges
    cycle_edges = []
    for cycle in cycles:
        n = len(cycle)
        for i in range(n):
            u = cycle[i]
            v = cycle[(i + 1) % n]
            cycle_edges.append({"from": u, "to": v})

    return cycles, cycle_edges


# ---------------------------------------------------------
# Simulation Lifecycle Management
# ---------------------------------------------------------
def reset_simulation_internal():
    """Stops all threads, resets locks and data structures cleanly."""
    global simulation_status, sync_barrier
    with state_lock:
        # Signal all threads to terminate
        for ctrl in thread_control.values():
            ctrl["stop_event"].set()
            ctrl["pause_event"].clear()

        # Release resources
        for lock in resources.values():
            lock.owner = None
            lock.wait_queue.clear()
            lock.cond.notify_all()

    # Wait briefly for threads to exit
    time.sleep(0.2)

    with state_lock:
        thread_control.clear()
        simulation_status = "Idle"
        sync_barrier = None

def start_threads_for_scenario(scenario="deadlock"):
    """Starts simulated threads for the selected scenario."""
    global simulation_status, sync_barrier, current_scenario
    reset_simulation_internal()
    current_scenario = scenario

    with state_lock:
        simulation_status = "Running"

    if scenario == "deadlock":
        # Classic circular wait:
        # T1 wants R1 then R2
        # T2 wants R2 then R3
        # T3 wants R3 then R1
        sync_barrier = threading.Barrier(3)
        sequences = {
            "T1": ["R1", "R2"],
            "T2": ["R2", "R3"],
            "T3": ["R3", "R1"]
        }
        add_log("=== Deadlock Demonstration Scenario Started ===", "warning")
        add_log("Sequences: T1(R1->R2), T2(R2->R3), T3(R3->R1) [Circular Wait]", "info")
        for name, seq in sequences.items():
            stop = threading.Event()
            pause = threading.Event()
            t = threading.Thread(
                target=thread_worker,
                args=(name, seq, stop, pause, True),
                daemon=True,
                name=f"Worker-{name}"
            )
            with state_lock:
                thread_control[name] = {
                    "thread": t,
                    "stop_event": stop,
                    "pause_event": pause,
                    "state": "Running",
                    "sequence": seq,
                    "held": [],
                    "waiting_for": None
                }
            t.start()

    else:
        # Normal execution scenario (Hierarchical order - No circular wait):
        # T1 wants R1 then R2
        # T2 wants R2 then R3
        # T3 wants R1 then R3 (Order strictly preserved, no cycles possible)
        sync_barrier = None
        sequences = {
            "T1": ["R1", "R2"],
            "T2": ["R2", "R3"],
            "T3": ["R1", "R3"]
        }
        add_log("=== Normal Execution Scenario (No Deadlock) Started ===", "info")
        add_log("Sequences: T1(R1->R2), T2(R2->R3), T3(R1->R3) [Hierarchical Ordering]", "info")
        for name, seq in sequences.items():
            stop = threading.Event()
            pause = threading.Event()
            t = threading.Thread(
                target=thread_worker,
                args=(name, seq, stop, pause, False),
                daemon=True,
                name=f"Worker-{name}"
            )
            with state_lock:
                thread_control[name] = {
                    "thread": t,
                    "stop_event": stop,
                    "pause_event": pause,
                    "state": "Running",
                    "sequence": seq,
                    "held": [],
                    "waiting_for": None
                }
            t.start()


# ---------------------------------------------------------
# Flask Web Routes & API Endpoints
# ---------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/state", methods=["GET"])
def get_state():
    """Returns the complete snapshot of the simulation state."""
    with state_lock:
        thread_info = {}
        for name, ctrl in thread_control.items():
            thread_info[name] = {
                "state": ctrl["state"],
                "sequence": ctrl["sequence"],
                "held": list(ctrl["held"]),
                "waiting_for": ctrl["waiting_for"]
            }

        lock_info = {}
        for name, lock in resources.items():
            lock_info[name] = {
                "owner": lock.owner,
                "waiting": list(lock.wait_queue)
            }

        edges = build_wait_for_graph()
        cycles, cycle_edges = detect_cycles(edges)

        # Check if deadlocked
        current_status = simulation_status
        if cycles and current_status not in ["Paused", "Resolved"]:
            current_status = "Deadlocked"

        stats = {
            "active_threads": sum(1 for c in thread_info.values() if c["state"] == "Running"),
            "waiting_threads": sum(1 for c in thread_info.values() if c["state"] == "Waiting"),
            "locks_held": sum(1 for l in lock_info.values() if l["owner"] is not None),
            "deadlocks_detected": deadlocks_detected_count,
            "deadlocks_resolved": deadlocks_resolved_count
        }

        return jsonify({
            "status": current_status,
            "scenario": current_scenario,
            "threads": thread_info,
            "locks": lock_info,
            "graph": edges,
            "cycles": cycles,
            "cycle_edges": cycle_edges,
            "log": log[-40:],  # Return recent 40 log items
            "stats": stats
        })

@app.route("/start", methods=["POST"])
def start_simulation():
    data = request.get_json(silent=True) or {}
    scenario = data.get("scenario")
    if not scenario:
        raw_text = request.get_data(as_text=True)
        if "normal" in raw_text:
            scenario = "normal"
        else:
            scenario = "deadlock"
    start_threads_for_scenario(scenario)
    return jsonify({"status": "started", "scenario": scenario})

@app.route("/pause", methods=["POST"])
def pause_simulation():
    global simulation_status
    with state_lock:
        simulation_status = "Paused"
        for ctrl in thread_control.values():
            ctrl["pause_event"].set()
    add_log("Simulation paused by user.", "warning")
    return jsonify({"status": "paused"})

@app.route("/resume", methods=["POST"])
def resume_simulation():
    global simulation_status
    with state_lock:
        simulation_status = "Running"
        for ctrl in thread_control.values():
            ctrl["pause_event"].clear()
            # Notify conditions to wake up threads
            for lock in resources.values():
                lock.cond.notify_all()
    add_log("Simulation resumed.", "info")
    return jsonify({"status": "resumed"})

@app.route("/reset", methods=["POST"])
def reset_simulation():
    global deadlocks_detected_count, deadlocks_resolved_count
    reset_simulation_internal()
    add_log("Simulation has been reset to initial state.", "info")
    return jsonify({"status": "reset"})

@app.route("/detect", methods=["POST"])
def detect_deadlock():
    global deadlocks_detected_count, simulation_status
    with state_lock:
        edges = build_wait_for_graph()
        cycles, cycle_edges = detect_cycles(edges)
        if cycles:
            deadlocks_detected_count += 1
            simulation_status = "Deadlocked"
            cycle_desc = " -> ".join(cycles[0] + [cycles[0][0]])
            add_log(f"DEADLOCK DETECTED! Cycle: {cycle_desc}", "error")
            return jsonify({
                "deadlock": True,
                "cycles": cycles,
                "cycle_edges": cycle_edges,
                "message": f"Deadlock cycle found: {cycle_desc}"
            })
        else:
            add_log("Deadlock detection check performed: No deadlock detected.", "success")
            return jsonify({
                "deadlock": False,
                "cycles": [],
                "cycle_edges": [],
                "message": "No deadlock detected."
            })

@app.route("/resolve", methods=["POST"])
def resolve_deadlock():
    """Resolves deadlock by terminating a selected victim thread cooperatively."""
    global deadlocks_resolved_count, simulation_status
    data = request.get_json(silent=True) or {}
    strategy = data.get("strategy", "fewest_locks")
    manual_victim = data.get("victim", None)

    with state_lock:
        edges = build_wait_for_graph()
        cycles, _ = detect_cycles(edges)
        if not cycles:
            return jsonify({"status": "no_deadlock", "message": "No deadlock cycle present to resolve."})

        # Determine eligible victim threads in the deadlock cycle
        cycle_threads = set()
        for c in cycles:
            cycle_threads.update(c)

        victim = None
        if strategy == "manual" and manual_victim:
            if manual_victim in thread_control:
                victim = manual_victim
            else:
                return jsonify({"status": "error", "message": f"Thread {manual_victim} does not exist."})
        else:
            # Policy: Choose victim from cycle holding fewest locks (or fewest resources)
            # This minimizes the amount of work undone
            min_locks = 999
            for t_name in sorted(cycle_threads):
                held_count = len(thread_control[t_name]["held"])
                if held_count < min_locks:
                    min_locks = held_count
                    victim = t_name

        if not victim and cycle_threads:
            victim = list(cycle_threads)[0]

        if not victim:
            return jsonify({"status": "error", "message": "Could not identify victim thread."})

        # Cooperatively cancel the victim thread
        ctrl = thread_control[victim]
        ctrl["stop_event"].set()
        ctrl["state"] = "Cancelled"
        ctrl["waiting_for"] = None

        # Remove victim from all resource wait queues
        for lock in resources.values():
            if victim in lock.wait_queue:
                lock.wait_queue.remove(victim)

        # Force-release all locks held by victim
        released_locks = []
        for res_name in list(ctrl["held"]):
            resources[res_name].force_release()
            released_locks.append(res_name)
        ctrl["held"].clear()

        deadlocks_resolved_count += 1
        simulation_status = "Resolved"
        add_log(f"RECOVERY EXECUTED: Terminated victim [{victim}] (Strategy: {strategy}).", "success")
        if released_locks:
            add_log(f"Resources released from [{victim}]: {', '.join(released_locks)}.", "info")

    return jsonify({
        "status": "resolved",
        "victim": victim,
        "strategy": strategy,
        "released_locks": released_locks,
        "message": f"Deadlock resolved by terminating victim {victim} and releasing locks ({', '.join(released_locks)})."
    })

if __name__ == "__main__":
    print("Starting Deadlock Detector & Resolver Flask Server...")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
