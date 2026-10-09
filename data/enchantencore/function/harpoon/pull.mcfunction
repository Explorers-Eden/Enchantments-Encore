##runs as the hooked mob: Motion = (player pos - mob pos) * factor, clamped, with a small upward lift
scoreboard players set $harpoon.max enchantencore.technical 37500
scoreboard players set $harpoon.min enchantencore.technical -37500

execute store result score $harpoon.mx enchantencore.technical run data get entity @s Pos[0] 100
execute store result score $harpoon.my enchantencore.technical run data get entity @s Pos[1] 100
execute store result score $harpoon.mz enchantencore.technical run data get entity @s Pos[2] 100

scoreboard players operation $harpoon.dx enchantencore.technical = $harpoon.px enchantencore.technical
scoreboard players operation $harpoon.dx enchantencore.technical -= $harpoon.mx enchantencore.technical
scoreboard players operation $harpoon.dx enchantencore.technical *= $harpoon.factor enchantencore.technical
scoreboard players operation $harpoon.dx enchantencore.technical < $harpoon.max enchantencore.technical
scoreboard players operation $harpoon.dx enchantencore.technical > $harpoon.min enchantencore.technical

scoreboard players operation $harpoon.dy enchantencore.technical = $harpoon.py enchantencore.technical
scoreboard players operation $harpoon.dy enchantencore.technical -= $harpoon.my enchantencore.technical
scoreboard players operation $harpoon.dy enchantencore.technical *= $harpoon.factor enchantencore.technical
scoreboard players add $harpoon.dy enchantencore.technical 4500
scoreboard players operation $harpoon.dy enchantencore.technical < $harpoon.max enchantencore.technical
scoreboard players operation $harpoon.dy enchantencore.technical > $harpoon.min enchantencore.technical

scoreboard players operation $harpoon.dz enchantencore.technical = $harpoon.pz enchantencore.technical
scoreboard players operation $harpoon.dz enchantencore.technical -= $harpoon.mz enchantencore.technical
scoreboard players operation $harpoon.dz enchantencore.technical *= $harpoon.factor enchantencore.technical
scoreboard players operation $harpoon.dz enchantencore.technical < $harpoon.max enchantencore.technical
scoreboard players operation $harpoon.dz enchantencore.technical > $harpoon.min enchantencore.technical

execute store result entity @s Motion[0] double 0.0001 run scoreboard players get $harpoon.dx enchantencore.technical
execute store result entity @s Motion[1] double 0.0001 run scoreboard players get $harpoon.dy enchantencore.technical
execute store result entity @s Motion[2] double 0.0001 run scoreboard players get $harpoon.dz enchantencore.technical

playsound minecraft:item.trident.riptide_1 player @a ~ ~ ~ 0.8 1.4
