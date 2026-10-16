import type { StudioProblem } from './StudioController';

export interface ProblemMessage {
  title: string;
  /** What to do, step by step where it helps. */
  steps: string[];
}

/** Which browser family, for permission instructions. */
export function browserFamily(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

const REENABLE: Record<ReturnType<typeof browserFamily>, string> = {
  chrome:
    'Click the icon at the left of the address bar, set Microphone to Allow, then reload the page.',
  edge: 'Click the lock icon at the left of the address bar, set Microphone to Allow, then reload.',
  firefox:
    'Click the microphone icon with a line through it in the address bar, remove the block, then reload.',
  safari:
    'Open Safari ▸ Settings for This Website (or aA ▸ Website Settings on iPhone), set Microphone to Allow, then reload.',
  other: "Open this site's settings in your browser, allow the microphone, then reload the page.",
};

/** What each problem means and how to fix it. */
export function problemMessage(p: StudioProblem): ProblemMessage {
  switch (p) {
    case 'denied':
      return {
        title: 'The microphone is blocked',
        steps: [REENABLE[browserFamily()], 'Nothing you sing leaves this device.'],
      };
    case 'no-device':
      return {
        title: 'No microphone found',
        steps: [
          'Plug in a headset or microphone, or turn on the built-in one.',
          'Check it is not muted in your system sound settings, then try again.',
        ],
      };
    case 'busy':
      return {
        title: 'The microphone is in use',
        steps: ['Close other apps or tabs using it (calls, recorders), then try again.'],
      };
    case 'insecure':
      return {
        title: 'The microphone needs a secure page',
        steps: ['Open Inharmonia over https (the address starts with https://).'],
      };
    case 'unsupported':
      return {
        title: 'This browser cannot record here',
        steps: ['Use a recent Chrome, Edge, Firefox or Safari.'],
      };
    case 'too-quiet':
      return {
        title: 'That was too quiet to hear',
        steps: [
          'Sing a little louder or move closer to the microphone.',
          'Check the level bar moves well past the middle while you sing.',
        ],
      };
    case 'too-noisy':
      return {
        title: 'There is a lot of background noise',
        steps: [
          'Use headphones so the click does not reach the microphone.',
          'Move away from fans, traffic or music, then record again.',
        ],
      };
    case 'no-pitch':
      return {
        title: 'No steady pitch found',
        steps: [
          'Sing or hum on a vowel ("loo" or "mm") rather than speaking or whistling.',
          'Hold each note for a moment, and start after the count-in.',
        ],
      };
    case 'calibration-failed':
      return {
        title: 'The claps were hard to line up',
        steps: [
          'Clap once, sharply, exactly on each click, close to the microphone.',
          'Or press Skip to use an estimate.',
        ],
      };
    default:
      return {
        title: 'Something went wrong with the microphone',
        steps: ['Reload the page and try again.'],
      };
  }
}
