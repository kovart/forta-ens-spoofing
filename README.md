# ENS Spoofing Bot

ENS Spoofing Bot detects attacks in which someone registers a name visually similar to an existing one.

[Forta Protocol](https://forta.org/), which monitors blockchain events in real-time, together with this bot allows
attacks to be detected before they happen or to minimize the damage from them. What's more, every ENS user will be able
to receive an alert if it happened to their name.

![ENS Spoofing Bot](/blob/preview.png)

## Status

> Work In Progress

## The problem

Names in the Ethereum Name Service are unique, but there are no restrictions on registering look-alike names that are
visually very difficult to distinguish from genuine ones.
For example, having a name `vitalik.eth`, an attacker can register a similar name by replacing the symbol
lowercase L with uppercase i: vita**I**ik.eth.
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

### Examples

| Legit name                      | Spoofing name                                              | Technique          |
| ------------------------------- | ---------------------------------------------------------- | ------------------ |
| wildcat.eth                     | w1ldcat.eth                                                | ASCII Homoglyph    |
| bitcoin.eth                     | Bitcoin.eth                                                | Uppercase          |
| danger.eth                      | dаnger.eth                                                 | Cyrillic Homoglyph |
| web3user.eth                    | web3uṡer.eth                                               | Unicode Homoglyph  |
| vitalik.eth                     | vitalik&#8203;.eth                                         | Zero Width Space   |
| of etheen / wizardsofetheen.eth | of&nbsp;&nbsp;etheen&nbsp;/&nbsp;&nbsp;wizardsofetheen.eth | Whitespace         |

## The Solution

ENS Spoofing Bot monitors on-chain contract events responsible for registering ".eth" names.
As soon as the bot detects a new registered name, it tries to normalize it and checks if a similar name has already been
registered.
If so, the bot fires an alert specifying the registered name, the existing normalized name, and the addresses of the
accounts to which these names are bound.

Forta Protocol allows each user to subscribe to alerts involving their addresses,
so if their name is spoofed, they will immediately receive a notification in one of the convenient ways: Email,
Telegram, Discord, Slack or Webhook.

## Supported Chains

- Ethereum

## Alerts

- AK-ENS-SPOOFING
  - Fired when a transaction contains a registration event for a .ETH name that visually similar to an existing one
  - Severity is always set to "low"
  - Type is always set to "suspicious"

## Test Data

No data yet
