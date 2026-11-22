package io.github.nikol1313.altex;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class GradeWorkerTest {
    @Test
    public void numReadsLikeParseFloat() {
        assertEquals(17, GradeWorker.num("17"), 0);
        assertEquals(17.5, GradeWorker.num(" 17.5 ქულა"), 0);
        assertEquals(0.5, GradeWorker.num(".5"), 0);
        assertTrue(Double.isNaN(GradeWorker.num("")));
        assertTrue(Double.isNaN(GradeWorker.num("არ გამოცხადდა")));
    }

    @Test
    public void changedSkipsFirstRunAndSubjectsWithoutPoints() {
        Map<String, Double> now = new HashMap<>();
        now.put("1", 19.0);
        now.put("2", 0.0);
        now.put("3", 5.0);
        now.put("4", 12.0);
        assertEquals(Collections.emptyList(), GradeWorker.changed(null, now));

        Map<String, Double> before = new HashMap<>();
        before.put("1", 15.0);
        before.put("4", 12.0);
        // 1 moved, 3 appeared with points; 2 appeared at 0 and 4 stayed: no news.
        assertEquals(Arrays.asList("1", "3"), GradeWorker.changed(before, now).stream().sorted().toList());
    }
}
