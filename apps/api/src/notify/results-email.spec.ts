import { describe, it, expect } from 'vitest';
import { renderResultsEmail, renderResultsSms, summarizeResults } from './results-email';

const ctx = { organizationName: 'Liberi Institute', electionName: 'Student Council Election 2026' };

const single = summarizeResults({
  ballotsCast: 5,
  positions: [{
    position: 'President', seats: 1,
    results: [{ candidate: 'Ada Kamara', votes: 3 }, { candidate: 'Ben Kollie', votes: 1 }, { candidate: 'Cy Doe', votes: 1 }],
  }],
});

describe('results announcement email', () => {
  it('follows the official template for a single winner', () => {
    const { subject, text } = renderResultsEmail(ctx, single);
    expect(subject).toBe('Official results: Student Council Election 2026');
    expect(text).toContain('Dear Voters,');
    expect(text).toContain('We are pleased to announce the official results of the Student Council Election 2026.');
    expect(text).toContain('Following the conclusion of the voting period and the verification of votes, we are delighted to announce that Ada Kamara has been elected as President.');
    expect(text).toContain('Election Results');
    expect(text).toContain('* Election: Student Council Election 2026');
    expect(text).toContain('* Position: President');
    expect(text).toContain('* Winner: Ada Kamara');
    expect(text).toContain('* Total Votes Cast: 5');
    expect(text).toContain('* Election Status: Completed');
    expect(text).toContain('Congratulations to Ada Kamara on this achievement.');
    expect(text).toContain('We also extend our sincere appreciation to all candidates who participated');
    expect(text).toContain('Thank you for making this election a success.');
    expect(text.trim().endsWith('Best regards,\nElection Administration Team\nLiberi Institute')).toBe(true);
  });

  it('puts the election office\'s announcement after the opening, when there is one', () => {
    const { text } = renderResultsEmail({ ...ctx, announcement: 'Certified by the committee.' }, single);
    expect(text.indexOf('has been elected as President.')).toBeLessThan(text.indexOf('Certified by the committee.'));
    expect(text.indexOf('Certified by the committee.')).toBeLessThan(text.indexOf('Election Results'));
  });

  it('lists every winner when there are several positions', () => {
    const s = summarizeResults({
      ballotsCast: 9,
      positions: [
        { position: 'President', seats: 1, results: [{ candidate: 'Ada Kamara', votes: 6 }, { candidate: 'Ben Kollie', votes: 3 }] },
        { position: 'Treasurer', seats: 1, results: [{ candidate: 'Cy Doe', votes: 5 }, { candidate: 'Di Roe', votes: 4 }] },
      ],
    });
    const { text } = renderResultsEmail(ctx, s);
    expect(text).toContain('announce that the following have been elected:');
    expect(text).toContain('* Ada Kamara, President');
    expect(text).toContain('* Cy Doe, Treasurer');
    expect(text).toContain('* President: Ada Kamara');
    expect(text).toContain('* Treasurer: Cy Doe');
    expect(text).toContain('Congratulations to Ada Kamara and Cy Doe on their achievements.');
  });

  it('never declares a winner among candidates tied for the last seat', () => {
    const s = summarizeResults({
      ballotsCast: 4,
      positions: [{ position: 'President', seats: 1, results: [{ candidate: 'Ada Kamara', votes: 2 }, { candidate: 'Ben Kollie', votes: 2 }] }],
    });
    expect(s.positions[0].winners).toEqual([]);
    expect(s.positions[0].tied).toEqual(['Ada Kamara', 'Ben Kollie']);
    const { text } = renderResultsEmail(ctx, s);
    expect(text).toContain('no winner could be declared');
    expect(text).toContain('* Winner: not declared');
    expect(text).toContain('Ada Kamara and Ben Kollie received the same number of votes');
    expect(text).not.toContain('Congratulations');
  });

  it('handles an election nobody voted in', () => {
    const s = summarizeResults({ ballotsCast: 0, positions: [{ position: 'President', seats: 1, results: [{ candidate: 'Ada Kamara', votes: 0 }] }] });
    const { text } = renderResultsEmail(ctx, s);
    expect(text).toContain('no winner could be declared');
    expect(text).toContain('* Total Votes Cast: 0');
  });

  it('fills several seats and only counts candidates who got votes', () => {
    const s = summarizeResults({
      ballotsCast: 7,
      positions: [{ position: 'Committee', seats: 2, results: [{ candidate: 'A', votes: 4 }, { candidate: 'B', votes: 2 }, { candidate: 'C', votes: 1 }, { candidate: 'D', votes: 0 }] }],
    });
    expect(s.positions[0].winners).toEqual(['A', 'B']);
    expect(renderResultsEmail(ctx, s).text).toContain('* Winners: A and B');
  });

  it('has a short text-message version', () => {
    const sms = renderResultsSms(ctx, single);
    expect(sms).toBe('Liberi Institute: official results of "Student Council Election 2026". Elected: Ada Kamara (President).');
  });
});
