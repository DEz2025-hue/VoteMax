/**
 * The official results announcement sent to voters. It follows the election
 * office's standard wording; only the names, positions and counts change.
 */

export interface PositionOutcome {
  position: string;
  seats: number;
  /** Elected candidates, most votes first. */
  winners: string[];
  /** Candidates level on votes for the last seat: no winner is declared among them. */
  tied: string[];
}

export interface ResultsSummary {
  totalVotes: number;
  positions: PositionOutcome[];
}

interface ReportLike {
  ballotsCast: number;
  positions: { position: string; seats: number; results: { candidate: string; votes: number }[] }[];
}

/** Who won each position: the top `seats` with votes, flagging a tie for the last seat instead of guessing. */
export function summarizeResults(report: ReportLike): ResultsSummary {
  return {
    totalVotes: report.ballotsCast,
    positions: report.positions.map((p) => {
      const rows = [...p.results].sort((a, b) => b.votes - a.votes);
      const cut = p.seats;
      const tieVotes = cut > 0 && rows.length > cut && rows[cut - 1].votes > 0 && rows[cut - 1].votes === rows[cut].votes
        ? rows[cut].votes : null;
      const winners: string[] = [];
      const tied: string[] = [];
      rows.forEach((r, i) => {
        if (r.votes <= 0) return;
        if (tieVotes !== null && r.votes === tieVotes) tied.push(r.candidate);
        else if (i < cut) winners.push(r.candidate);
      });
      return { position: p.position, seats: p.seats, winners, tied };
    }),
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface ResultsEmailContext {
  organizationName: string;
  electionName: string;
  /** Optional message from the election office, shown after the opening paragraphs. */
  announcement?: string | null;
}

export function renderResultsEmail(ctx: ResultsEmailContext, summary: ResultsSummary): { subject: string; text: string } {
  const elected = summary.positions.flatMap((p) => p.winners.map((name) => ({ name, position: p.position })));
  const single = summary.positions.length === 1 ? summary.positions[0] : null;

  let announce: string;
  if (elected.length === 0) {
    announce = 'the election has concluded, but no winner could be declared.';
  } else if (elected.length === 1) {
    announce = `we are delighted to announce that ${elected[0].name} has been elected as ${elected[0].position}.`;
  } else {
    announce = `we are delighted to announce that the following have been elected:\n\n${elected.map((e) => `* ${e.name}, ${e.position}`).join('\n')}`;
  }

  const lines: string[] = [
    'Dear Voters,',
    '',
    `We are pleased to announce the official results of the ${ctx.electionName}.`,
    '',
    `Following the conclusion of the voting period and the verification of votes, ${announce}`,
    '',
  ];
  if (ctx.announcement) lines.push(ctx.announcement.trim(), '');

  lines.push('Election Results', '');
  lines.push(`* Election: ${ctx.electionName}`);
  if (single) {
    lines.push(`* Position: ${single.position}`);
    lines.push(single.winners.length
      ? `* ${single.winners.length === 1 ? 'Winner' : 'Winners'}: ${joinNames(single.winners)}`
      : '* Winner: not declared');
    if (single.tied.length) lines.push(`* Tie: ${joinNames(single.tied)} received the same number of votes for the last seat`);
  }
  lines.push(`* Total Votes Cast: ${summary.totalVotes}`);
  lines.push('* Election Status: Completed');

  if (!single && summary.positions.length) {
    lines.push('', 'By position', '');
    for (const p of summary.positions) {
      const result = p.winners.length ? joinNames(p.winners) : 'no winner declared';
      lines.push(`* ${p.position}: ${result}`);
      if (p.tied.length) lines.push(`  (${joinNames(p.tied)} received the same number of votes for the last seat)`);
    }
  }

  lines.push('');
  const names = elected.map((e) => e.name);
  if (names.length === 1) lines.push(`Congratulations to ${names[0]} on this achievement.`, '');
  else if (names.length > 1) lines.push(`Congratulations to ${joinNames(names)} on their achievements.`, '');
  lines.push(
    'We also extend our sincere appreciation to all candidates who participated and to every voter who took the time to exercise their right to vote. Your participation helps strengthen our democratic process.',
    '',
    'Thank you for making this election a success.',
    '',
    'Best regards,',
    'Election Administration Team',
    ctx.organizationName,
  );

  return { subject: `Official results: ${ctx.electionName}`, text: lines.join('\n') };
}

/** Short text-message version: who was elected, nothing else. */
export function renderResultsSms(ctx: ResultsEmailContext, summary: ResultsSummary): string {
  const elected = summary.positions.flatMap((p) => p.winners.map((name) => `${name} (${p.position})`));
  const tail = elected.length ? `Elected: ${elected.join('; ')}.` : 'No winner could be declared.';
  return `${ctx.organizationName}: official results of "${ctx.electionName}". ${tail}`.slice(0, 320);
}
