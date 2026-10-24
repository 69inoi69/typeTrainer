// Learn's laps (after keybr): when every letter is open

// and mastered (Learn complete), the goal speed goes up by StepWPM and the
// letters are learned again at it, up to MaxWPM. The model itself does not
// change: a lap only hands it another TargetWPM (Params.ForLap), so every
// formula of model.go works as before. docs/ALGORITHM.md section 6.1.

package engine

// LapParams are the numbers of the laps (internal/config).
type LapParams struct {
	StepWPM float64 // the goal goes up this much per lap
	MaxWPM  float64 // ...and no higher: the last lap has this goal
}

// ForLap returns the parameters of lap n (0 = the first, at TargetWPM):
// the same with TargetWPM + n * StepWPM, at most MaxWPM. A negative lap
// counts as the first.
func (p Params) ForLap(n int, lp LapParams) Params {
	p.TargetWPM = min(p.TargetWPM+float64(max(n, 0))*lp.StepWPM, max(lp.MaxWPM, p.TargetWPM))
	return p
}

// LastLap is the number of the last lap: the one whose goal is MaxWPM
// (0 when there is no room above TargetWPM, or StepWPM is 0).
func (p Params) LastLap(lp LapParams) int {
	if lp.StepWPM <= 0 || lp.MaxWPM <= p.TargetWPM {
		return 0
	}
	return int((lp.MaxWPM - p.TargetWPM) / lp.StepWPM)
}

// LapDone says whether a lap is over: every letter of order is open and
// mastered at the lap's goal (p already ForLap). The caller then starts the
// next lap (StartLap), unless it was the last.
func LapDone(stats map[string]KeyStat, order []string, unlocked int, p Params) bool {
	if unlocked < len(order) || len(order) == 0 {
		return false
	}
	for _, c := range order {
		if !Mastered(stats[c], p) {
			return false
		}
	}
	return true
}

// StartLap returns the statistics for a new lap: the same numbers, but no
// letter counts as mastered any more (Held off). Each must reach the new
// goal again; the EMAs are kept, so a letter already fast enough is
// mastered again at its next press. The input map is not changed.
func StartLap(stats map[string]KeyStat) map[string]KeyStat {
	out := make(map[string]KeyStat, len(stats))
	for k, v := range stats {
		v.Held = false
		out[k] = v
	}
	return out
}
