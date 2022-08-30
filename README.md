# ENS Spoofing Bot

ENS Spoofing Bot is a [Forta Protocol](https://forta.org/) bot that notifies users that their name may have been spoofed and publish it to
Forta Explorer, which allows new types of scam attacks to be detected and the damage from them minimized.

![ENS Spoofing Bot](/blob/preview.png)

## Status

> The proposal was created on Gitcoin

## The problem

Names in the Ethereum Name Service are unique,
but there are no restrictions on registering look-alike names that are visually very difficult to distinguish from
genuine ones.
For example, having a name `vitalik.eth`, an attacker can register a similar name by replacing the symbol lowercase L with
uppercase i: vita**I**ik.eth.
The name is visually similar, but it is treated by the protocol as a completely different name, with its own hash, as
well as an address bound to it.

This type of attack is called [a homograph attack](https://en.wikipedia.org/wiki/IDN_homograph_attack).
Regarding the ENS protocol, it can be performed in the following ways:

- Substitution of character pairs i/I, i/j, O/0, w/vv, m/rn, which depending on the typeface, may be difficult or
  impossible to distinguish;
- Replacing ascii characters with visually similar ones from Unicode; for example, “faсebooсk.eth” uses the letters o
  and с from Cyrillic;
- Use of invisible Unicode characters;
- Spoofing using uppercase letters; for example, bitcoin.eth may be spoofed as Bitcoin.eth.

ENS fights this attack pretty hard by normalizing names before they are registered,
as well as warning against using non-ascii characters on its site.
However, to save gas, such checks have been implemented off-chain, on the frontend side.
Any user can register a name bypassing the official site by calling the protocol contract directly.

## The Proposal

It is proposed to develop a Forta bot that monitors on-chain contract events responsible for registering ".eth" names.
As soon as the bot detects a new registered name, it tries to normalize it and checks if a similar name has already been
registered.
If so, the bot fires an alert specifying the registered name, the existing normalized name, and the addresses of the
accounts to which these names are bound.

Forta Protocol allows each user to subscribe to alerts involving their addresses,
so if their name is spoofed, they will immediately receive a notification in one of the convenient ways: Email,
Telegram, Discord, Slack or Webhook.

In addition, when combined with bots that detect subsequent stages of suspicious activity, we will have enough evidence
to claim a scam attack.
For example, the next follow-up checks could be obtaining tokens, selling them, and laundering funds through services
like Tornado Cash.
As a result, the Forta ENS Spoofing Bot will play an important role in detecting scam attacks, maximizing the chances of
their detection.