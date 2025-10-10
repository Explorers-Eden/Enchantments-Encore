schedule function enchantencore:regrowth/init 5t

execute as @e[type=minecraft:marker,tag=enchantencore.regrowth.marker] at @s run particle minecraft:happy_villager ~ ~ ~ 0.2 0.2 0.2 0.1 10 normal

execute as @e[type=minecraft:marker,tag=enchantencore.regrowth.wheat] at @s run setblock ~ ~ ~ minecraft:wheat[age=0]
execute as @e[type=minecraft:marker,tag=enchantencore.regrowth.beetroots] at @s run setblock ~ ~ ~ minecraft:beetroots[age=0]
execute as @e[type=minecraft:marker,tag=enchantencore.regrowth.potatoes] at @s run setblock ~ ~ ~ minecraft:potatoes[age=0]
execute as @e[type=minecraft:marker,tag=enchantencore.regrowth.carrots] at @s run setblock ~ ~ ~ minecraft:carrots[age=0]

kill @e[type=minecraft:marker,tag=enchantencore.regrowth.marker]
