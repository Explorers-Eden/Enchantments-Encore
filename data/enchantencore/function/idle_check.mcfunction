schedule function enchantencore:idle_check 10t

execute as @a at @s if predicate enchantencore:entity/is_idle run scoreboard players add @s enchantencore.idle_time 1
execute as @a at @s unless predicate enchantencore:entity/is_idle run scoreboard players set @s enchantencore.idle_time 0