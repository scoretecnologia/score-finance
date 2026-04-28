import io
from ofxparse import OfxParser

def test_ofx():
    bad_ofx = b"""OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20230101120000</DTPOSTED>
            <TRNAMT>100.00</TRNAMT>
            <FITID>12345</FITID>
            <MEMO>Transfer\xe9ncia</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
"""
    try:
        text = bad_ofx.decode('latin-1')
        ofx = OfxParser.parse(io.StringIO(text))
        print("Success StringIO! Memo:", ofx.account.statement.transactions[0].memo)
    except Exception as e:
        print(f"Failed StringIO: {e}")

if __name__ == "__main__":
    test_ofx()
