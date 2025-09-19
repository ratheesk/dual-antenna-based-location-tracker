import streamlit as st
import requests
import time
import json
from sseclient import SSEClient
import threading
import pandas as pd

# ---------------- CONFIG ----------------
ESP32_IP_DEFAULT = "10.214.162.121"
RECONNECT_INTERVAL = 10  # seconds

# ---------------- GLOBALS ----------------
rssi_data = pd.DataFrame(columns=["angle", "rssi"])
connected = False
current_status = "Idle"
current_angle = 0
best_angle = None
best_rssi = None
progress = 0
max_angle = 180
stop_sse = False

# ---------------- UTILITY FUNCTIONS ----------------
def ping_esp(ip):
    try:
        resp = requests.get(f"http://{ip}/", timeout=5)
        return resp.status_code == 200
    except:
        return False

def send_command(ip, endpoint, data=None):
    try:
        url = f"http://{ip}{endpoint}"
        if data:
            resp = requests.post(url, json=data, timeout=10)
        else:
            resp = requests.post(url, timeout=10)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        st.error(f"Command failed: {e}")
    return None

def sse_listener(ip):
    global rssi_data, current_status, current_angle, best_angle, best_rssi, progress, max_angle, connected, stop_sse
    while not stop_sse:
        if not ping_esp(ip):
            connected = False
            time.sleep(RECONNECT_INTERVAL)
            continue
        connected = True
        try:
            messages = SSEClient(f"http://{ip}/events")
            for msg in messages:
                if stop_sse:
                    break
                if msg.event == "status":
                    data = json.loads(msg.data)
                    current_status = data.get("status", current_status)
                    current_angle = data.get("currentAngle", current_angle)
                    best_angle = data.get("bestAngle", best_angle)
                    best_rssi = data.get("bestRSSI", best_rssi)
                    progress = data.get("progress", progress)
                    max_angle = data.get("maxAngle", max_angle)
                elif msg.event == "angleUpdate":
                    data = json.loads(msg.data)
                    if data['rssi'] != -999:
                        rssi_data.loc[len(rssi_data)] = [data['angle'], data['rssi']]
                elif msg.event == "trackingStarted":
                    rssi_data = pd.DataFrame(columns=["angle", "rssi"])
                elif msg.event == "scanComplete":
                    data = json.loads(msg.data)
                    best_angle = data['bestAngle']
                    best_rssi = data['bestRSSI']
        except Exception as e:
            connected = False
            time.sleep(RECONNECT_INTERVAL)

# ---------------- STREAMLIT UI ----------------
st.set_page_config(page_title="LoRa Antenna Tracker", layout="wide")
st.title("📡 LoRa Antenna Tracker")

col1, col2 = st.columns([2, 1])
with col1:
    esp32_ip = st.text_input("ESP32 IP Address:", ESP32_IP_DEFAULT)
with col2:
    if st.button("Connect"):
        stop_sse = False
        threading.Thread(target=sse_listener, args=(esp32_ip,), daemon=True).start()
        st.success("Connecting to ESP32...")

st.markdown("---")

# Status and controls
status_col1, status_col2, status_col3, status_col4 = st.columns(4)
status_col1.metric("Status", current_status)
status_col2.metric("Current Angle", f"{current_angle}°")
status_col3.metric("Best Angle", f"{best_angle if best_angle is not None else '-'}")
status_col4.metric("Best RSSI", f"{best_rssi if best_rssi is not None else '-'} dBm")

st.markdown("---")
control_col1, control_col2, control_col3, control_col4 = st.columns(4)

if control_col1.button("Start Scan"):
    send_command(esp32_ip, "/api/start")
if control_col2.button("Stop Scan"):
    send_command(esp32_ip, "/api/stop")
if control_col3.button("Reset"):
    send_command(esp32_ip, "/api/reset")
servo_angle = control_col4.slider("Manual Servo Control", 0, 180, 0)
if control_col4.button("Move Servo"):
    send_command(esp32_ip, "/api/servo", {"angle": servo_angle})

st.markdown("---")
st.subheader("Scan Progress")
st.progress(int((progress/max_angle)*100 if max_angle else 0))
st.text(f"{progress} / {max_angle}")

st.markdown("---")
st.subheader("RSSI Chart")
if not rssi_data.empty:
    st.line_chart(rssi_data.rename(columns={"angle": "Angle", "rssi": "RSSI"}).set_index("Angle"))
else:
    st.info("Start scanning to see RSSI data.")

st.markdown("---")
st.subheader("Live Log")
log_container = st.empty()
def display_log():
    log_entries = [
        f"Status: {current_status}, Angle: {current_angle}°, Best: {best_angle}/{best_rssi} dBm"
    ]
    if not rssi_data.empty:
        for i, row in rssi_data.tail(10).iterrows():
            log_entries.append(f"Angle {row['angle']}° - RSSI {row['rssi']} dBm")
    log_container.text("\n".join(log_entries))

# Auto-refresh every 1s
while True:
    display_log()
    time.sleep(1)