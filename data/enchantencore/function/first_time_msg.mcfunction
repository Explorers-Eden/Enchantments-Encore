scoreboard players set $datapack_info enchantencore.technical 1

execute at @s run playsound minecraft:entity.chicken.egg neutral @s ~ ~ ~ .6 2
tellraw @s {"translate":"message.enchantencore.datapack.info"}