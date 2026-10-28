# Deadlock Detector & Resolver — OS Mini Project

A system-monitoring dashboard and simulation engine for the **Operating Systems** subject. This application simulates concurrent threads acquiring shared mutex locks, dynamically constructs a **Wait-for Graph (WFG)**, discovers deadlocks using **Depth-First Search (DFS) Cycle Detection**, and executes **Safe Cooperative Deadlock Recovery**.

---

## 🌐 Live Localhost URL

When the server is running, access the dashboard at:

👉 **[http://localhost:5000](http://localhost:5000)** (or [http://127.0.0.1:5000](http://127.0.0.1:5000))

---

## 🛠️ Project Structure

```
Deadlock-Detector-Resolver/
│
├── app.py                # Python Flask server & multithreading simulation engine
├── requirements.txt      # Python dependencies (Flask==3.1.3)
├── README.md             # Project documentation & OS Viva guide
├── venv/                 # Virtual environment with installed dependencies
│
├── templates/
│   └── index.html        # Modern Dark-Navy Desktop Monitoring Dashboard
│
└── static/
    ├── style.css         # Responsive styling, animations & theme tokens
    └── script.js         # Dynamic SVG Wait-for Graph renderer & polling client
```

---

## ⚡ Quick Start & How to Run

### Step 1: Open Terminal in Project Directory
```powershell
cd "C:\Users\rushi\OneDrive\Desktop\Deadlock-Detector-Resolver"
```

### Step 2: Run the Server
The project includes a ready-to-use virtual environment in `venv/`:

```powershell
.\venv\bin\python.exe app.py
```

*(Alternatively, if you use standard Windows Python: `python app.py`)*

You will see:
```
Starting Deadlock Detector & Resolver Flask Server...
 * Running on http://127.0.0.1:5000
 * Running on http://localhost:5000
```

### Step 3: Open in Browser
Open **[http://localhost:5000](http://localhost:5000)** in Chrome, Edge, or Firefox.

---

## 🖥️ Dashboard Features

1. **Top Header**: Live simulation status pill (`Idle`, `Running`, `Deadlocked`, `Resolved`, `Paused`) and active scenario badge.
2. **Left Sidebar**: Quick navigation across Dashboard, Threads, Resources, Graph, Logs, and Concepts.
3. **Control Strip**:
   - **Simulation Scenario Selector**: Toggle between *Deadlock Demo (Circular Wait)* and *Normal Execution (Hierarchical Ordering)*.
   - **Start Simulation**: Launches concurrent threads.
   - **Pause / Resume**: Cooperatively pauses and resumes thread workers.
   - **Reset**: Safely aborts threads, frees all locks, and clears logs.
   - **Detect Deadlock**: Runs DFS on the WFG to identify circular dependency loops.
   - **Resolve Deadlock**: Cooperatively terminates a victim thread and re-allocates locks.
   - **Strategy Dropdown**: Choose between *Fewest Held Locks* (minimal work undone) or *Manual Victim*.
4. **4 Metric KPI Cards**:
   - **Active Threads**: Threads currently holding resources and running.
   - **Waiting Threads**: Threads blocked waiting for a lock.
   - **Deadlocks Detected**: Cumulative counter of graph cycles detected.
   - **Deadlocks Resolved**: Cumulative counter of deadlocks resolved.
5. **Interactive Wait-for Graph (WFG)**:
   - Dynamic SVG canvas showing threads as nodes and waiting dependencies as directional arrows (`Ti -> Tj`).
   - Standard dependencies shown in **Blue (`#3b82f6`)**.
   - Deadlock cycles highlighted in glowing **Red (`#ef4444`)**.
   - Click any node directly to target it for manual termination.
6. **Shared Resources (Mutexes) Panel**:
   - Real-time status for `R1`, `R2`, and `R3` (`LOCKED` vs `FREE`).
   - Current thread owner and FIFO wait queue.
7. **Thread Monitoring Table**:
   - Live state (`Running`, `Waiting`, `Completed`, `Cancelled`).
   - Acquisition sequence, held locks, and blocked lock targets.
   - Direct inline **Terminate** button per thread.
8. **Live Event Stream**:
   - Color-coded timestamped log (Info, Warning, Error, Success).

---

## 🧪 Step-by-Step Demonstration Guide (For Viva)

### Scenario A: Demonstrating Deadlock & Recovery
1. Open the dashboard at `http://localhost:5000`.
2. Ensure the scenario dropdown is set to **"Deadlock Demo (Circular Wait: T1-T2-T3)"**.
3. Click **"Start Simulation"**:
   - `T1` acquires `R1` and requests `R2`.
   - `T2` acquires `R2` and requests `R3`.
   - `T3` acquires `R3` and requests `R1`.
   - All 3 threads enter the `Waiting` state.
4. Observe the **Wait-for Graph (WFG)**:
   - Directed edges form a closed loop: `T1 -> T2 -> T3 -> T1`.
   - The status changes to **Deadlocked**.
5. Click **"Detect Deadlock"**:
   - The detector reports: `Deadlock cycle found: T3 -> T1 -> T2 -> T3`.
   - The cycle edges glow in bright **Red**.
6. Select Strategy **"Auto: Terminate Victim with Fewest Locks"** and click **"Resolve Deadlock"**:
   - Victim `T1` is cooperatively cancelled and its held resource `R1` is force-released.
   - `T3` immediately unblocks, acquires `R1`, finishes its work, and releases all locks.
   - `T2` unblocks, acquires `R3`, and completes.
   - The cycle disappears, `Deadlocks Resolved` increments to `1`, and status becomes **Resolved**.

### Scenario B: Demonstrating Normal Execution (No Deadlock)
1. Select **"Normal Execution (Hierarchical Ordering: No Deadlock)"** in the dropdown.
2. Click **"Start Simulation"**:
   - Threads request resources in strict hierarchical order: `T1(R1->R2)`, `T2(R2->R3)`, `T3(R1->R3)`.
   - Because circular wait is broken, threads acquire and release resources sequentially.
   - All threads transition to `Completed`.
3. Click **"Detect Deadlock"**:
   - System outputs: `No deadlock detected`.

---

## 🎓 Operating Systems Theory & Viva Questions

### 1. What are Coffman's Four Conditions for Deadlock?
A deadlock can occur if and only if all four conditions hold simultaneously:
1. **Mutual Exclusion**: At least one resource must be held in a non-shareable mode.
2. **Hold and Wait**: A thread must be holding at least one resource and waiting to acquire additional resources held by other threads.
3. **No Preemption**: Resources cannot be preempted; a resource can only be released voluntarily by the thread holding it.
4. **Circular Wait**: A closed chain of threads exists such that each thread holds at least one resource needed by the next thread in the chain.

### 2. What is a Wait-for Graph (WFG)?
A Wait-for Graph is a directed graph where:
- Nodes represent **threads/processes**.
- A directed edge $T_i \rightarrow T_j$ means that thread $T_i$ is waiting for a resource currently held by thread $T_j$.
- **Theorem**: If each resource type has exactly **one instance**, a cycle in the Wait-for Graph is both a **necessary and sufficient** condition for deadlock.

### 3. How does cycle detection work in this project?
The backend maintains an adjacency list of active wait edges and runs **Depth-First Search (DFS)** with a recursion stack. If DFS encounters a node already present in the current traversal path, a back-edge (cycle) is detected. Time complexity is $\mathcal{O}(V + E)$.

### 4. Why cooperative cancellation instead of `thread.kill()`?
In Python and modern OS design, forcibly killing a thread is unsafe because the thread might be in the middle of modifying shared memory or holding system locks, which would lead to orphaned locks and undefined state. Cooperative cancellation uses atomic flags (`threading.Event`) and condition variables to wake up threads and ensure locks are released cleanly.
