# run once per wearer per tick, even with several cursed armor pieces
execute store result score #now enchantencore.ownership run time query gametime
execute if score @s enchantencore.ownership = #now enchantencore.ownership run return 0
scoreboard players operation @s enchantencore.ownership = #now enchantencore.ownership

tag @s add enchantencore.ownership_wearer
execute as @e[type=#enchantencore:pets] if function enchantencore:ownership_curse/is_owned unless predicate enchantencore:entity/has_no_hurttime run damage @a[tag=enchantencore.ownership_wearer,limit=1] 1 minecraft:indirect_magic
tag @s remove enchantencore.ownership_wearer
