import test from 'node:test';
import assert from 'node:assert/strict';
import { moodFrequency, setSoundEnabled, isSoundEnabled, playTick, playSaved, playMood, playGoalDone, playLevelUp, playRestOver, playSetComplete, playGoodDay } from '../gym/js/sfx.js';

test('a mood tap rises in pitch with the mood, one step a level', () => {
    const notes = [1, 2, 3, 4, 5].map(moodFrequency);
    for (let i = 1; i < notes.length; i += 1) assert.ok(notes[i] > notes[i - 1], `level ${i + 1} is higher than ${i}`);
    assert.equal(new Set(notes).size, 5);
});

test('a mood outside 1 to 5, or no mood at all, still gets a sensible note', () => {
    assert.equal(moodFrequency(0), moodFrequency(1));
    assert.equal(moodFrequency(9), moodFrequency(5));
    assert.equal(moodFrequency(2.4), moodFrequency(2));
    assert.equal(moodFrequency(undefined), moodFrequency(3));
    assert.equal(moodFrequency('x'), moodFrequency(3));
});

test('the switch is a plain on/off, on by default', () => {
    assert.equal(isSoundEnabled(), true);
    setSoundEnabled(false);
    assert.equal(isSoundEnabled(), false);
    setSoundEnabled(1);
    assert.equal(isSoundEnabled(), true);
});

test('every sound is safe to call with no audio (before the first tap, in Node) and with sound off', () => {
    const all = [() => playTick(true), () => playTick(false), playSaved, () => playMood(4), playGoalDone, playLevelUp, playRestOver, playSetComplete, playGoodDay];
    for (const enabled of [true, false]) {
        setSoundEnabled(enabled);
        for (const play of all) assert.doesNotThrow(play);
    }
    setSoundEnabled(true);
});
