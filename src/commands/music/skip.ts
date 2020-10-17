import { Message } from 'discord.js';

import { Command, CommandDocs } from '..';
import { CmdArgs } from '../../types';

export class CommandSkip implements Command {
  cmd = 'skip';
  docs: CommandDocs = {
    usage: 'skip',
    description: 'skip current video',
  };
  async executor(cmdArgs: CmdArgs): Promise<void | Message> {
    const { msg, queueStore } = cmdArgs;
    const queue = queueStore.get(msg.guild?.id as string);

    if (!queue.playing) return msg.channel.send('not playing');

    try {
      queue.voiceConnection?.dispatcher?.end('skip command');
    } catch (err) {
      return msg.channel.send(`error: \n\`\`\`\n${err.stack}\n\`\`\``);
    }

    return msg.channel.send('skipped');
  }
}
