import { Message } from 'discord.js';
import randomWords from 'random-words';

import { Command } from '..';
import { Config } from '../../entities/Config';
import { CmdArgs } from '../../types';
import { dbFindOneError } from '../../util';

export class CommandRandom implements Command {
  cmd = 'random';
  docs = {
    usage: 'random [msgs=1]',
    description: 'ok',
  };
  async executor(cmdArgs: CmdArgs): Promise<void | Message> {
    const { msg, args, em } = cmdArgs;

    const config = await em.findOneOrFail(
      Config,
      { guildId: msg.guild?.id as string },
      { failHandler: dbFindOneError(msg.channel) }
    );

    if (!config.allowSpam) {
      return msg.channel.send('spam commands are off');
    }

    const messages: string[] = [];

    let amount = 1;
    if (args[0]) {
      if (isNaN(parseInt(args[0]))) return msg.channel.send('invalid amount');
      else if (amount > 10) return msg.channel.send('too many, max 10');

      amount = parseInt(args[0]);
    }

    for (let i = 0; i < amount; i++) {
      let text = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const append = ' ' + randomWords(1);
        if (text.length + append.length > 2000) break;
        text += append;
      }
      messages.push(text);
    }

    for (const message of messages) {
      msg.channel.send(message);
    }
  }
}
