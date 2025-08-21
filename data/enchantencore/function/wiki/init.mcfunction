schedule function enchantencore:wiki/init 1s
scoreboard players enable @a enchantencore.dialog_trigger.wiki

execute as @a[scores={enchantencore.dialog_trigger.wiki=1..}] run function enchantencore:wiki/get_entry

scoreboard players set @a enchantencore.dialog_trigger.wiki 0