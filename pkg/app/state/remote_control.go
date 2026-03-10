package state

import (
	"fmt"
	"io"
	"net"
	"slices"
	"strings"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

func (a *App) ConfigureRemoteStarter(starter RemoteStarter) {
	a.remoteStarter = starter
}

func (a *App) GetRemoteAccessInfo() types.RemoteAccessInfo {
	a.remoteInfoMu.RLock()
	defer a.remoteInfoMu.RUnlock()
	return a.remoteInfo
}

func (a *App) EnableRemoteAccess() (types.RemoteAccessInfo, error) {
	a.remoteInfoMu.Lock()
	defer a.remoteInfoMu.Unlock()

	if a.remoteControl != nil {
		return a.remoteInfo, nil
	}
	if a.remoteStarter == nil {
		return a.remoteInfo, fmt.Errorf("remote access is unavailable")
	}

	remoteControl, err := a.remoteStarter(a)
	if err != nil {
		a.emitDebugLog("warn", "remote.start", "remote control startup failed", map[string]any{
			"error": err.Error(),
		})
		return a.remoteInfo, err
	}

	selectedHost := normalizeSelectedRemoteHost(a.remoteInfo.SelectedHost, a.remoteInfo.AvailableHosts)
	if selectedHost != "" {
		if info, setErr := remoteControl.SetSelectedHost(selectedHost); setErr == nil {
			a.remoteControl = remoteControl
			a.remoteInfo = mergeRemoteInfoMetadata(info, a.remoteInfo.AvailableHosts)
			return a.remoteInfo, nil
		}
	}

	a.remoteControl = remoteControl
	a.remoteInfo = mergeRemoteInfoMetadata(remoteControl.Info(), a.remoteInfo.AvailableHosts)
	a.emitDebugLog("info", "remote.start", "remote control ready", map[string]any{
		"listenAddress": a.remoteInfo.ListenAddress,
		"enabled":       a.remoteInfo.Enabled,
	})
	return a.remoteInfo, nil
}

func (a *App) DisableRemoteAccess() types.RemoteAccessInfo {
	a.remoteInfoMu.Lock()
	defer a.remoteInfoMu.Unlock()

	if a.remoteControl != nil {
		_ = a.remoteControl.Close()
		a.remoteControl = nil
	}
	a.remoteInfo = mergeRemoteInfoMetadata(types.RemoteAccessInfo{
		Enabled:      false,
		SelectedHost: a.remoteInfo.SelectedHost,
	}, a.remoteInfo.AvailableHosts)
	return a.remoteInfo
}

func (a *App) SelectRemoteAccessHost(host string) (types.RemoteAccessInfo, error) {
	a.remoteInfoMu.Lock()
	defer a.remoteInfoMu.Unlock()

	availableHosts := discoverRemoteHosts()
	selectedHost := normalizeSelectedRemoteHost(host, availableHosts)
	if selectedHost == "" {
		return a.remoteInfo, fmt.Errorf("invalid remote host")
	}

	if a.remoteControl != nil {
		info, err := a.remoteControl.SetSelectedHost(selectedHost)
		if err != nil {
			return a.remoteInfo, err
		}
		a.remoteInfo = mergeRemoteInfoMetadata(info, availableHosts)
		return a.remoteInfo, nil
	}

	a.remoteInfo = mergeRemoteInfoMetadata(types.RemoteAccessInfo{
		Enabled:      false,
		SelectedHost: selectedHost,
	}, availableHosts)
	return a.remoteInfo, nil
}

func (a *App) initializeRemoteAccessInfo() {
	a.remoteInfoMu.Lock()
	defer a.remoteInfoMu.Unlock()

	availableHosts := discoverRemoteHosts()
	a.remoteInfo = mergeRemoteInfoMetadata(types.RemoteAccessInfo{
		Enabled: false,
	}, availableHosts)
}

func mergeRemoteInfoMetadata(info types.RemoteAccessInfo, availableHosts []string) types.RemoteAccessInfo {
	if len(availableHosts) == 0 {
		availableHosts = discoverRemoteHosts()
	}
	info.AvailableHosts = slices.Clone(availableHosts)
	info.SelectedHost = normalizeSelectedRemoteHost(info.SelectedHost, availableHosts)
	if !info.Enabled {
		info.ListenAddress = ""
		info.PairingURL = ""
		info.PairingToken = ""
		info.QRCodeDataURL = ""
	}
	return info
}

func normalizeSelectedRemoteHost(selected string, availableHosts []string) string {
	selected = strings.TrimSpace(selected)
	if selected != "" {
		for _, host := range availableHosts {
			if strings.EqualFold(host, selected) {
				return host
			}
		}
	}
	if len(availableHosts) > 0 {
		return availableHosts[0]
	}
	return ""
}

func discoverRemoteHosts() []string {
	hosts := make([]string, 0, 8)
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, addrErr := iface.Addrs()
			if addrErr != nil {
				continue
			}
			for _, addr := range addrs {
				ipNet, ok := addr.(*net.IPNet)
				if !ok || ipNet.IP == nil {
					continue
				}
				ip := ipNet.IP.To4()
				if ip == nil {
					continue
				}
				hosts = append(hosts, ip.String())
			}
		}
	}
	if len(hosts) == 0 {
		hosts = append(hosts, "127.0.0.1")
	}
	slices.SortFunc(hosts, compareRemoteHosts)
	return slices.Compact(hosts)
}

func compareRemoteHosts(left, right string) int {
	if left == right {
		return 0
	}
	leftRank := remoteHostRank(left)
	rightRank := remoteHostRank(right)
	if leftRank != rightRank {
		return leftRank - rightRank
	}
	if left < right {
		return -1
	}
	return 1
}

func remoteHostRank(host string) int {
	switch {
	case strings.HasPrefix(host, "192.168."):
		return 0
	case strings.HasPrefix(host, "10."):
		return 1
	case isRFC1918172(host):
		return 2
	case host == "127.0.0.1":
		return 9
	default:
		return 3
	}
}

func isRFC1918172(host string) bool {
	if !strings.HasPrefix(host, "172.") {
		return false
	}
	parts := strings.Split(host, ".")
	if len(parts) != 4 {
		return false
	}
	switch parts[1] {
	case "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31":
		return true
	default:
		return false
	}
}

type RemoteStarter func(*App) (RemoteControl, error)

type RemoteControl interface {
	io.Closer
	Info() types.RemoteAccessInfo
	SetSelectedHost(host string) (types.RemoteAccessInfo, error)
}
