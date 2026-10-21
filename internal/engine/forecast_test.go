package engine

import "testing"

var fp = ForecastParams{Window: 6, MinRounds: 3, MaxRounds: 50}

// fp30: the mastery rule of the config, written out (20 presses, 5 %, 30
// wpm = 400 ms), and its EMA step.
var fp30 = Params{TargetWPM: 30, MasteryMinSamples: 20, MasteryErrorRate: 0.05, Alpha: 0.1}

// line: n rounds, presses growing by per, errors and time falling by the steps given.
func line(n, count, per int, err, errStep, ms, msStep float64) []Point {
	out := make([]Point, n)
	for i := range out {
		out[i] = Point{Count: count + i*per, ErrEMA: err + float64(i)*errStep, TimeEMA: ms + float64(i)*msStep}
	}
	return out
}

// slip gives the last point n more mistakes than the first and the ErrEMA err.
func slip(pts []Point, n int, err float64) []Point {
	pts[len(pts)-1].Mistakes = pts[0].Mistakes + n
	pts[len(pts)-1].ErrEMA = err
	return pts
}

func TestRoundsToMastery(t *testing.T) {
	cases := []struct {
		name   string
		points []Point
		want   int
		ok     bool
	}{
		{"no data", nil, 0, false},
		{"at the goal already", []Point{{Count: 30, ErrEMA: 0.02, TimeEMA: 380}}, 0, true},
		{"too few rounds", line(2, 10, 10, 0.2, -0.02, 600, -20), 0, false},
		{"never timed", line(6, 10, 10, 0.2, -0.02, 0, 0), 0, false},
		// time falls 20 ms a round, 100 ms to go -> 5 rounds; errors already fine
		{"speed decides", line(6, 30, 10, 0.03, 0, 600, -20), 5, true},
		// errors fall 0.01 a round, 0.05 over the goal -> 5; time 1 round
		// no mistakes lately (q = 0), ErrEMA 0.2: ln(0.05/0.2)/ln(0.9) = 13.2
		// presses, 5 a round -> 3 rounds; time already fine
		{"errors decide", line(6, 30, 5, 0.2, 0, 380, 0), 3, true},
		// one mistake in the 25 presses (q = 0.04) just lifted ErrEMA to 0.12:
		// ln(0.01/0.08)/ln(0.9) = 19.7 presses -> 4 rounds, not "getting worse"
		{"one slip", slip(line(6, 30, 5, 0.03, 0, 380, 0), 1, 0.12), 4, true},
		// 5 mistakes in 25 presses (20 %): that pace never gets under 5 %
		{"too many mistakes lately", slip(line(6, 30, 5, 0.03, 0, 380, 0), 5, 0.2), 0, false},
		// 12 presses, 2 a round, 20 needed -> 4 rounds
		{"presses decide", line(6, 2, 2, 0.01, 0, 350, 0), 4, true},
		{"not getting faster", line(6, 30, 10, 0.03, 0, 600, 5), 0, false},
		{"no presses come", line(6, 10, 0, 0.01, 0, 350, 0), 0, false},
		// 2 ms a round, 300 ms to go -> 150 -> "more than 50"
		{"far away", line(6, 30, 10, 0.03, 0, 710, -2), 51, true},
		// a speck over the goal (401 ms) still needs a round
		{"almost", line(6, 30, 10, 0.03, 0, 406, -1), 1, true},
	}
	for _, c := range cases {
		got, ok := RoundsToMastery(c.points, fp30, fp)
		if got != c.want || ok != c.ok {
			t.Errorf("%s: %d, %v; want %d, %v", c.name, got, ok, c.want, c.ok)
		}
	}
}

// Only the last Window rounds count: an old bad stretch does not hide a
// letter that is improving now.
func TestRoundsToMastery_Window(t *testing.T) {
	pts := append(line(10, 0, 5, 0.03, 0, 500, 30), line(10, 50, 5, 0.03, 0, 680, -20)...)
	if got, ok := RoundsToMastery(pts, fp30, fp); !ok || got != 5 {
		t.Errorf("window: %d, %v; want 5 (500 ms, the last rounds fall 20 ms each)", got, ok)
	}
}

func TestLaps(t *testing.T) {
	p, lp := Params{TargetWPM: 30}, LapParams{StepWPM: 5, MaxWPM: 60}
	for _, c := range []struct {
		lap  int
		want float64
	}{{0, 30}, {1, 35}, {6, 60}, {9, 60}, {-1, 30}} {
		if got := p.ForLap(c.lap, lp).TargetWPM; got != c.want {
			t.Errorf("lap %d: %v wpm, want %v", c.lap, got, c.want)
		}
	}
	if got := p.LastLap(lp); got != 6 {
		t.Errorf("last lap %d, want 6", got)
	}
	if got := p.LastLap(LapParams{}); got != 0 {
		t.Errorf("no laps configured: last lap %d", got)
	}
	if p.ForLap(3, LapParams{}).TargetWPM != 30 {
		t.Error("no laps configured: the goal must not move")
	}

	m := Params{TargetWPM: 30, MasteryMinSamples: 20, MasteryErrorRate: 0.05}
	done := KeyStat{Count: 30, ErrEMA: 0.01, TimeEMA: 380, TimedCount: 30, Held: true}
	stats := map[string]KeyStat{"a": done, "b": done}
	if LapDone(stats, []string{"a", "b", "c"}, 2, m) {
		t.Error("a letter still locked: the lap is not done")
	}
	if !LapDone(stats, []string{"a", "b"}, 2, m) {
		t.Error("every letter open and mastered: the lap is done")
	}
	if LapDone(nil, nil, 0, m) {
		t.Error("no letters: not done")
	}
	next := StartLap(stats)
	if next["a"].Held || !stats["a"].Held || next["a"].TimeEMA != 380 {
		t.Errorf("StartLap: %+v (input %+v)", next["a"], stats["a"])
	}
	// at 35 wpm (343 ms) 380 ms is too slow: no longer mastered, the lap goes on
	if LapDone(next, []string{"a", "b"}, 2, m.ForLap(1, lp)) {
		t.Error("the next lap is done at once")
	}
}
