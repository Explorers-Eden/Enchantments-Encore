schedule function enchantencore:pickpocket/tracker 1t

execute as @a at @s if items entity @s armor.chest #minecraft:chest_armor[minecraft:enchantments~[{enchantments:"enchantencore:pickpocket",levels:1}]] run scoreboard players set @s enchantencore.pickpocket 1
execute as @a at @s unless items entity @s armor.chest #minecraft:chest_armor[minecraft:enchantments~[{enchantments:"enchantencore:pickpocket",levels:1}]] run scoreboard players set @s enchantencore.pickpocket 0
