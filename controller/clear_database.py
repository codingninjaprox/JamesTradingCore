#!/usr/bin/env python3
"""
Database Cleanup Script
Removes all records from the accounts table
"""

import os
import sys
import logging
from pathlib import Path

# Add the current directory to Python path to import modules
sys.path.append(str(Path(__file__).parent))

from db.mysql_database import MySQLDatabaseManager
from config.config import config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def clear_database():
    """Clear all records from the accounts table and remove MT4Instances files"""
    try:
        logger.info("🗑️ Starting database cleanup...")
        
        # Get database configuration from config
        db_config = {
            'host': config.MYSQL_HOST,
            'port': config.MYSQL_PORT,
            'database': config.MYSQL_DATABASE,
            'username': config.MYSQL_USERNAME,
            'password': config.MYSQL_PASSWORD
        }
        
        logger.info(f"📊 Database config: {db_config['host']}:{db_config['port']}/{db_config['database']}")
        
        # Initialize database connection
        db = MySQLDatabaseManager(
            host=db_config['host'],
            port=db_config['port'],
            database=db_config['database'],
            username=db_config['username'],
            password=db_config['password']
        )
        
        logger.info("✅ Connected to database successfully")
        
        # Get current record count
        try:
            conn = db._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM accounts")
            current_count = cursor.fetchone()[0]
            logger.info(f"📊 Current records in database: {current_count}")
            
            if current_count == 0:
                logger.info("ℹ️ Database is already empty")
            else:
                # Confirm deletion
                print(f"\n⚠️  WARNING: This will delete ALL {current_count} records from the accounts table!")
                print("This action cannot be undone.")
                
                confirm = input("\nType 'YES' to confirm deletion: ")
                
                if confirm != 'YES':
                    logger.info("❌ Deletion cancelled by user")
                    return False
                
                # Delete all records
                logger.info("🗑️ Deleting all records from accounts table...")
                cursor.execute("DELETE FROM accounts")
                
                # Commit the changes
                conn.commit()
                
                # Verify deletion
                cursor.execute("SELECT COUNT(*) FROM accounts")
                new_count = cursor.fetchone()[0]
                
                if new_count == 0:
                    logger.info(f"✅ Successfully deleted {current_count} records from database")
                    logger.info("🗑️ Database is now empty")
                else:
                    logger.error(f"❌ Failed to delete all records. Remaining: {new_count}")
                    return False
            
            # Clean up MT4Instances folder
            logger.info("🗑️ Cleaning up MT4Instances folder...")
            mt4_instances_path = Path("C:/JamesPlatform/MT4Instances")
            
            if mt4_instances_path.exists():
                # Count items before deletion
                try:
                    items = list(mt4_instances_path.iterdir())
                    item_count = len(items)
                    logger.info(f"📊 Found {item_count} items in MT4Instances folder")
                    
                    if item_count > 0:
                        # Confirm MT4Instances cleanup
                        print(f"\n⚠️  WARNING: This will delete ALL {item_count} items from MT4Instances folder!")
                        print("This will remove all MT4 terminal installations and cannot be undone.")
                        
                        confirm = input("\nType 'YES' to confirm MT4Instances cleanup: ")
                        
                        if confirm != 'YES':
                            logger.info("❌ MT4Instances cleanup cancelled by user")
                        else:
                            # Remove all items in MT4Instances folder
                            logger.info("🗑️ Removing all items from MT4Instances folder...")
                        import shutil
                        
                        for item in items:
                            try:
                                if item.is_file():
                                    item.unlink()
                                    logger.info(f"✅ Deleted file: {item.name}")
                                elif item.is_dir():
                                    shutil.rmtree(item)
                                    logger.info(f"✅ Deleted directory: {item.name}")
                            except Exception as e:
                                logger.warning(f"⚠️ Could not delete {item.name}: {e}")
                        
                        # Verify cleanup
                        remaining_items = list(mt4_instances_path.iterdir())
                        if len(remaining_items) == 0:
                            logger.info("✅ MT4Instances folder is now empty")
                        else:
                            logger.warning(f"⚠️ Some items remain in MT4Instances folder: {len(remaining_items)} items")
                    else:
                        logger.info("ℹ️ MT4Instances folder is already empty")
                    
                except Exception as e:
                    logger.error(f"❌ Error cleaning up MT4Instances folder: {e}")
                    return False
            else:
                logger.info("ℹ️ MT4Instances folder does not exist")
            
            # Clean up MT5Instances folder
            logger.info("🗑️ Cleaning up MT5Instances folder...")
            mt5_instances_path = Path("C:/JamesPlatform/MT5Instances")
            
            if mt5_instances_path.exists():
                # Count items before deletion
                try:
                    items = list(mt5_instances_path.iterdir())
                    item_count = len(items)
                    logger.info(f"📊 Found {item_count} items in MT5Instances folder")
                    
                    if item_count > 0:
                        # Confirm MT5Instances cleanup
                        print(f"\n⚠️  WARNING: This will delete ALL {item_count} items from MT5Instances folder!")
                        print("This will remove all MT5 terminal installations and cannot be undone.")
                        
                        confirm = input("\nType 'YES' to confirm MT5Instances cleanup: ")
                        
                        if confirm != 'YES':
                            logger.info("❌ MT5Instances cleanup cancelled by user")
                        else:
                            # Remove all items in MT5Instances folder
                            logger.info("🗑️ Removing all items from MT5Instances folder...")
                            import shutil
                            
                            for item in items:
                                try:
                                    if item.is_file():
                                        item.unlink()
                                        logger.info(f"✅ Deleted file: {item.name}")
                                    elif item.is_dir():
                                        shutil.rmtree(item)
                                        logger.info(f"✅ Deleted directory: {item.name}")
                                except Exception as e:
                                    logger.warning(f"⚠️ Could not delete {item.name}: {e}")
                            
                            # Verify cleanup
                            remaining_items = list(mt5_instances_path.iterdir())
                            if len(remaining_items) == 0:
                                logger.info("✅ MT5Instances folder is now empty")
                            else:
                                logger.warning(f"⚠️ Some items remain in MT5Instances folder: {len(remaining_items)} items")
                    else:
                        logger.info("ℹ️ MT5Instances folder is already empty")
                        
                except Exception as e:
                    logger.error(f"❌ Error cleaning up MT5Instances folder: {e}")
                    return False
            else:
                logger.info("ℹ️ MT5Instances folder does not exist")
                
        except Exception as e:
            logger.error(f"❌ Error during database operation: {e}")
            return False
        finally:
            cursor.close()
            conn.close()
            
        logger.info("✅ Database and MT4/MT5Instances cleanup completed successfully")
        return True
            
    except Exception as e:
        logger.error(f"❌ Error during cleanup: {e}")
        return False

def main():
    """Main function"""
    print("🗑️ Database and MT4/MT5Instances Cleanup Tool")
    print("=" * 50)
    print("This script will remove ALL records from the accounts table")
    print("AND delete ALL files/folders from the MT4Instances and MT5Instances directories.")
    print("Use with caution - this action cannot be undone!")
    print()
    
    try:
        success = clear_database()
        
        if success:
            print("\n✅ Database and MT4/MT5Instances cleanup completed successfully!")
        else:
            print("\n❌ Cleanup failed!")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️ Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 