"""Create only a new, private build VM and its unattended seed ISO."""
from pathlib import Path
import os
import secrets
import shutil
import subprocess
import xml.sax.saxutils as xml

root = Path.home() / '.local/share/16competitive-build/windows'
root.mkdir(parents=True, exist_ok=True)
os.chmod(root, 0o700)
iso = root / 'windows11-eval.iso'
if iso.stat().st_size != 5112850432:
    raise SystemExit('Official Windows evaluation ISO download is incomplete')
name = '16competitive-build-win11'
if subprocess.run(['virsh', '-c', 'qemu:///session', 'dominfo', name], capture_output=True).returncode == 0:
    raise SystemExit('Build VM already exists; refusing to replace it')
disk = root / 'build.qcow2'
if disk.exists():
    raise SystemExit('Build disk already exists; refusing to replace it')
key = root / 'ssh-key.pub'
if not key.exists():
    subprocess.run(['ssh-keygen', '-t', 'ed25519', '-N', '', '-C', '16competitive-build-vm', '-f', str(root / 'ssh-key')], check=True)
password = secrets.token_urlsafe(32) + '!aA1'
credential = root / 'initial-password'
credential.write_text(password + '\n')
os.chmod(credential, 0o600)
seed = root / 'seed'
seed.mkdir(exist_ok=True)
shutil.copyfile(key, seed / 'ssh-key.pub')
shutil.copyfile(Path(__file__).with_name('bootstrap-windows.ps1'), seed / 'bootstrap.ps1')
password = xml.escape(password)
unattend = f'''<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
 <settings pass="windowsPE">
  <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
   <SetupUILanguage><UILanguage>en-US</UILanguage></SetupUILanguage><InputLocale>0409:00000409</InputLocale><SystemLocale>en-US</SystemLocale><UILanguage>en-US</UILanguage><UserLocale>en-US</UserLocale>
  </component>
  <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
   <DiskConfiguration><Disk wcm:action="add"><DiskID>0</DiskID><WillWipeDisk>true</WillWipeDisk>
    <CreatePartitions>
     <CreatePartition wcm:action="add"><Order>1</Order><Type>EFI</Type><Size>100</Size></CreatePartition>
     <CreatePartition wcm:action="add"><Order>2</Order><Type>MSR</Type><Size>16</Size></CreatePartition>
     <CreatePartition wcm:action="add"><Order>3</Order><Type>Primary</Type><Extend>true</Extend></CreatePartition>
    </CreatePartitions><ModifyPartitions>
     <ModifyPartition wcm:action="add"><Order>1</Order><PartitionID>1</PartitionID><Format>FAT32</Format><Label>System</Label></ModifyPartition>
     <ModifyPartition wcm:action="add"><Order>2</Order><PartitionID>3</PartitionID><Format>NTFS</Format><Label>Build</Label><Letter>C</Letter></ModifyPartition>
    </ModifyPartitions></Disk></DiskConfiguration>
   <ImageInstall><OSImage><InstallFrom><MetaData wcm:action="add"><Key>/IMAGE/INDEX</Key><Value>1</Value></MetaData></InstallFrom><InstallTo><DiskID>0</DiskID><PartitionID>3</PartitionID></InstallTo><WillShowUI>OnError</WillShowUI></OSImage></ImageInstall>
   <UserData><AcceptEula>true</AcceptEula><FullName>16C Build</FullName><Organization>16 Competitive</Organization></UserData>
  </component>
 </settings>
 <settings pass="specialize"><component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"><ComputerName>16c-build</ComputerName><TimeZone>Singapore Standard Time</TimeZone></component></settings>
 <settings pass="oobeSystem">
  <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"><InputLocale>0409:00000409</InputLocale><SystemLocale>en-US</SystemLocale><UILanguage>en-US</UILanguage><UserLocale>en-US</UserLocale></component>
  <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
   <OOBE><HideEULAPage>true</HideEULAPage><HideOnlineAccountScreens>true</HideOnlineAccountScreens><HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE><ProtectYourPC>3</ProtectYourPC></OOBE>
   <UserAccounts><LocalAccounts><LocalAccount wcm:action="add"><Name>build</Name><Group>Administrators</Group><Password><Value>{password}</Value><PlainText>true</PlainText></Password></LocalAccount></LocalAccounts></UserAccounts>
   <AutoLogon><Password><Value>{password}</Value><PlainText>true</PlainText></Password><Enabled>true</Enabled><LogonCount>1</LogonCount><Username>build</Username></AutoLogon>
   <FirstLogonCommands><SynchronousCommand wcm:action="add"><Order>1</Order><Description>Provision local Windows build tools</Description><CommandLine>powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$v = Get-Volume | Where-Object FileSystemLabel -eq '16CSEED'; &amp; ($v.DriveLetter + ':\\bootstrap.ps1')"</CommandLine></SynchronousCommand></FirstLogonCommands>
  </component>
 </settings>
</unattend>'''
(seed / 'Autounattend.xml').write_text(unattend)
os.chmod(seed / 'Autounattend.xml', 0o600)
subprocess.run(['genisoimage', '-quiet', '-J', '-r', '-V', '16CSEED', '-o', str(root / 'seed.iso'), str(seed)], check=True)
os.chmod(root / 'seed.iso', 0o600)
subprocess.run(['virt-install', '--connect', 'qemu:///session', '--name', name,
 '--memory', '8192', '--vcpus', '6', '--cpu', 'host-passthrough', '--os-variant', 'win11', '--machine', 'q35',
 '--boot', 'uefi,cdrom,hd', '--tpm', 'backend.type=emulator,backend.version=2.0,model=tpm-crb',
 '--disk', f'path={disk},size=120,bus=sata,format=qcow2',
 '--disk', f'path={iso},device=cdrom,bus=sata', '--disk', f'path={root / "seed.iso"},device=cdrom,bus=sata',
 '--network', 'none', '--graphics', 'spice,listen=127.0.0.1', '--video', 'qxl', '--noautoconsole',
 '--qemu-commandline=-netdev user,id=buildnet,hostfwd=tcp:127.0.0.1:2222-:22 -device e1000e,netdev=buildnet,bus=pcie.0,addr=0x0e'], check=True)
print('Created the dedicated Windows build VM. Existing VMs and physical disks were not used.')
