package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"time"
)

type SystemInfo struct {
	IPAddress     string `json:"ipAddress"`
	Processes     string `json:"processes"`
	DiskSpace     string `json:"diskSpace"`
	UptimeSeconds int64  `json:"uptimeSeconds"`
}

func getSystemInfo() (SystemInfo, error) {
	var sysInfo SystemInfo
	// ip address information
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return sysInfo, err
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			sysInfo.IPAddress = ipnet.IP.String()
			break
		}
	}

	// list of processes running
	psCmd := exec.Command("ps", "-ax")
	psOutput, err := psCmd.Output()
	if err != nil {
		return sysInfo, err
	}
	sysInfo.Processes = string(psOutput)

	// diskspace
	dfCmd := exec.Command("df", "-h")
	dfOutput, err := dfCmd.Output()
	if err != nil {
		return sysInfo, err
	}
	sysInfo.DiskSpace = string(dfOutput)

	// system uptime in seconds
	sysInfo.UptimeSeconds = int64(time.Since(time.Unix(0, 0)).Seconds())

	return sysInfo, nil
}

func requestHandler(w http.ResponseWriter, r *http.Request) {
	sysInfo, err := getSystemInfo()
	if err != nil {
		http.Error(w, "Error getting system information", http.StatusInternalServerError)
		return
	}
	jsonData, err := json.Marshal(sysInfo)
	if err != nil {
		http.Error(w, "Error occured", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(jsonData)
}

func main() {
	http.HandleFunc("/", requestHandler)
	port := ":8200"
	fmt.Println("Service2 listening on port", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
