// Learn's laps after every letter is mastered.

package engine

type LapParams struct {
	StepWPM float64
	MaxWPM  float64
}

func (p Params) ForLap(n int, lp LapParams) Params {
	p.TargetWPM = min(p.TargetWPM+float64(max(n, 0))*lp.StepWPM, max(lp.MaxWPM, p.TargetWPM))
	return p
}

func (p Params) LastLap(lp LapParams) int {
	if lp.StepWPM <= 0 || lp.MaxWPM <= p.TargetWPM {
		return 0
	}
	return int((lp.MaxWPM - p.TargetWPM) / lp.StepWPM)
}

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

func StartLap(stats map[string]KeyStat) map[string]KeyStat {
	out := make(map[string]KeyStat, len(stats))
	for k, v := range stats {
		v.Held = false
		out[k] = v
	}
	return out
}
